-- D2: owned attempts and retry receipts. Only trusted server operations write evaluated evidence.
create table public.diagnostic_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content_version text not null,
  rubric_version text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  public_content jsonb not null check (jsonb_typeof(public_content) = 'object' and octet_length(public_content::text) <= 16384),
  answers jsonb not null default '[]' check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 8 and octet_length(answers::text) <= 8192),
  revision integer not null default 1 check (revision > 0),
  status text not null default 'in_progress' check (status in ('in_progress','evaluated')),
  evaluation jsonb check (evaluation is null or (jsonb_typeof(evaluation) = 'object' and octet_length(evaluation::text) <= 32768)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  evaluated_at timestamptz,
  unique (id,user_id),
  check ((status='in_progress' and evaluation is null and evaluated_at is null)
      or (status='evaluated' and evaluation is not null and evaluated_at is not null))
);
create unique index one_active_diagnostic on public.diagnostic_attempts(user_id) where status='in_progress';
create index diagnostic_attempts_recent on public.diagnostic_attempts(user_id,created_at desc,id);

create table public.diagnostic_mutations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  attempt_id uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  result jsonb not null check (jsonb_typeof(result)='object' and octet_length(result::text)<=512),
  primary key(user_id,request_id),
  foreign key(attempt_id,user_id) references public.diagnostic_attempts(id,user_id) on delete cascade
);
alter table public.diagnostic_attempts enable row level security;
alter table public.diagnostic_mutations enable row level security;
create policy read_own_diagnostic on public.diagnostic_attempts for select to authenticated using ((select auth.uid())=user_id);
create policy read_own_diagnostic_receipts on public.diagnostic_mutations for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.diagnostic_attempts, public.diagnostic_mutations from public,anon,authenticated;
grant select on public.diagnostic_attempts, public.diagnostic_mutations to authenticated;
grant select,insert,update,delete on public.diagnostic_attempts, public.diagnostic_mutations to service_role;

alter table public.skill_evidence add column assessment_attempt_id uuid;
alter table public.skill_evidence add column scope text check (scope is null or char_length(scope) between 1 and 400);
alter table public.skill_evidence add constraint evidence_diagnostic_source
  check (assessment_attempt_id is null or (kind='quiz' and scope is not null and source_id=assessment_attempt_id::text));
alter table public.skill_evidence add constraint evidence_diagnostic_owner
  foreign key(assessment_attempt_id,user_id) references public.diagnostic_attempts(id,user_id) on delete cascade;
create unique index one_evidence_per_diagnostic_skill on public.skill_evidence(assessment_attempt_id,skill_id) where assessment_attempt_id is not null;

alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check check (type in
  ('onboarding_completed','passport_updated','course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated'));
alter table public.learning_events drop constraint course_event_receipt;
alter table public.learning_events add constraint domain_event_receipt check (
  (type in ('course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated') and request_hash is not null
    and result is not null and jsonb_typeof(result)='object' and octet_length(result::text)<=512)
  or (type in ('onboarding_completed','passport_updated') and request_hash is null and result is null)
);

create function public.start_diagnostic_attempt(p_user_id uuid,p_request_id uuid,p_public_content jsonb,p_rubric_version text,p_content_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  attempt public.diagnostic_attempts;
  prior public.diagnostic_mutations;
  fingerprint text;
  receipt jsonb;
  created boolean := false;
begin
  if p_user_id is null or p_request_id is null or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$'
    or p_rubric_version is distinct from 'objective-subset-v1'
    or p_public_content is null or jsonb_typeof(p_public_content)<>'object' or octet_length(p_public_content::text)>16384
    or p_public_content->>'version' is distinct from 'javascript-foundations-v1'
    or jsonb_typeof(p_public_content->'questions') is distinct from 'array' or jsonb_array_length(p_public_content->'questions')<>8
    or p_public_content::text like '%"correctChoiceIds"%' then
    raise exception 'Invalid diagnostic definition' using errcode='22023';
  end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('operation','start','content',p_public_content,'rubric',p_rubric_version,'hash',p_content_hash)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into prior from public.diagnostic_mutations where user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.request_hash<>fingerprint then raise exception 'Request already used' using errcode='PT409'; end if;
    return prior.result;
  end if;
  if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Passport required' using errcode='PT409'; end if;
  if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request already used' using errcode='PT409'; end if;
  select * into attempt from public.diagnostic_attempts where user_id=p_user_id and status='in_progress';
  if not found then
    insert into public.diagnostic_attempts(user_id,content_version,rubric_version,content_hash,public_content)
      values(p_user_id,p_public_content->>'version',p_rubric_version,p_content_hash,p_public_content) returning * into attempt;
    created:=true;
  end if;
  receipt:=jsonb_build_object('attemptId',attempt.id,'revision',attempt.revision,'status',attempt.status);
  insert into public.diagnostic_mutations values(p_user_id,p_request_id,attempt.id,fingerprint,receipt);
  if created then insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result)
    values(p_user_id,'diagnostic_started',p_request_id,attempt.id,fingerprint,receipt); end if;
  return receipt;
end;
$$;

create function public.save_diagnostic_answers(p_user_id uuid,p_attempt_id uuid,p_expected_revision integer,p_answers jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.diagnostic_attempts; prior public.diagnostic_mutations; fingerprint text; receipt jsonb; answer jsonb; question jsonb; choice jsonb;
begin
  if p_user_id is null or p_attempt_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<1
    or p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)>8 or octet_length(p_answers::text)>8192 then
    raise exception 'Invalid answers' using errcode='22023';
  end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('operation','save','attempt',p_attempt_id,'revision',p_expected_revision,'answers',p_answers)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into prior from public.diagnostic_mutations where user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.request_hash<>fingerprint then raise exception 'Request already used' using errcode='PT409'; end if;
    return prior.result;
  end if;
  if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request already used' using errcode='PT409'; end if;
  select * into attempt from public.diagnostic_attempts where id=p_attempt_id and user_id=p_user_id for update;
  if not found then raise exception 'Attempt not found' using errcode='PT404'; end if;
  if attempt.status<>'in_progress' or attempt.revision<>p_expected_revision then raise exception 'Attempt changed' using errcode='PT409'; end if;
  if (select count(distinct value->>'questionId') from jsonb_array_elements(p_answers))<>jsonb_array_length(p_answers) then
    raise exception 'Duplicate answers' using errcode='22023'; end if;
  for answer in select value from jsonb_array_elements(p_answers) loop
    if jsonb_typeof(answer)<>'object' or not(answer ?& array['questionId','choiceIds']) or (select count(*) from jsonb_object_keys(answer))<>2
      or jsonb_typeof(answer->'questionId')<>'string' or jsonb_typeof(answer->'choiceIds') not in ('array','null') then
      raise exception 'Invalid answer' using errcode='22023'; end if;
    select value into question from jsonb_array_elements(attempt.public_content->'questions') where value->>'id'=answer->>'questionId';
    if not found then raise exception 'Unknown question' using errcode='22023'; end if;
    if jsonb_typeof(answer->'choiceIds')='array' then
      if jsonb_array_length(answer->'choiceIds') not between 1 and 4
        or (question->>'selection'='single' and jsonb_array_length(answer->'choiceIds')<>1)
        or (select count(distinct value) from jsonb_array_elements(answer->'choiceIds'))<>jsonb_array_length(answer->'choiceIds') then
        raise exception 'Invalid choices' using errcode='22023'; end if;
      for choice in select value from jsonb_array_elements(answer->'choiceIds') loop
        if jsonb_typeof(choice)<>'string' or not exists(select 1 from jsonb_array_elements(question->'choices') c where c->>'id'=choice#>>'{}') then
          raise exception 'Unknown choice' using errcode='22023'; end if;
      end loop;
    end if;
  end loop;
  update public.diagnostic_attempts set answers=p_answers,revision=revision+1,updated_at=clock_timestamp() where id=p_attempt_id returning * into attempt;
  receipt:=jsonb_build_object('attemptId',attempt.id,'revision',attempt.revision,'status',attempt.status);
  insert into public.diagnostic_mutations values(p_user_id,p_request_id,p_attempt_id,fingerprint,receipt);
  return receipt;
end;
$$;

create function public.evaluate_diagnostic_attempt(p_user_id uuid,p_attempt_id uuid,p_expected_revision integer,p_answers jsonb,p_evaluation jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  attempt public.diagnostic_attempts;
  prior public.diagnostic_mutations;
  fingerprint text;
  receipt jsonb;
  observation jsonb;
  finding jsonb;
  question jsonb;
  answer jsonb;
  n_answered integer;
  n_questions integer;
  points numeric;
  expected_status text;
  evidence_id uuid;
  prior_evidence public.skill_evidence;
  prior_status text;
  can_update boolean;
  findings jsonb := '[]';
  evaluated_time timestamptz;
  caveat text;
begin
  if p_user_id is null or p_attempt_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<1
    or p_answers is null or jsonb_typeof(p_answers)<>'array' or jsonb_array_length(p_answers)<>8
    or p_evaluation is null or jsonb_typeof(p_evaluation)<>'object' or octet_length(p_evaluation::text)>24576 then
    raise exception 'Invalid evaluation' using errcode='22023'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('operation','evaluate','attempt',p_attempt_id,'revision',p_expected_revision,'answers',p_answers,'evaluation',p_evaluation)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into prior from public.diagnostic_mutations where user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.request_hash<>fingerprint then raise exception 'Request already used' using errcode='PT409'; end if;
    return prior.result;
  end if;
  if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request already used' using errcode='PT409'; end if;
  select * into attempt from public.diagnostic_attempts where id=p_attempt_id and user_id=p_user_id for update;
  if not found then raise exception 'Attempt not found' using errcode='PT404'; end if;
  if attempt.status<>'in_progress' or attempt.revision<>p_expected_revision or attempt.answers<>p_answers then
    raise exception 'Attempt changed' using errcode='PT409'; end if;
  if not(p_evaluation ?& array['version','rubricVersion','contentHash','observations','findings','limitations'])
    or (select count(*) from jsonb_object_keys(p_evaluation))<>6
    or p_evaluation->>'version' is distinct from attempt.content_version
    or p_evaluation->>'rubricVersion' is distinct from attempt.rubric_version
    or p_evaluation->>'contentHash' is distinct from attempt.content_hash
    or jsonb_typeof(p_evaluation->'observations') is distinct from 'array' or jsonb_array_length(p_evaluation->'observations')<>8
    or jsonb_typeof(p_evaluation->'findings') is distinct from 'array' or jsonb_array_length(p_evaluation->'findings')<>4
    or jsonb_typeof(p_evaluation->'limitations') is distinct from 'array' or jsonb_array_length(p_evaluation->'limitations') not between 1 and 5 then
    raise exception 'Invalid evaluation provenance' using errcode='22023'; end if;
  if (select count(distinct value->>'questionId') from jsonb_array_elements(p_evaluation->'observations'))<>8
    or (select count(distinct value->>'skillId') from jsonb_array_elements(p_evaluation->'findings'))<>4 then
    raise exception 'Duplicate evaluation scope' using errcode='22023'; end if;
  for observation in select value from jsonb_array_elements(p_evaluation->'observations') loop
    if jsonb_typeof(observation)<>'object' or not(observation ?& array['questionId','skillId','outcome','earnedPoints','explanation'])
      or (select count(*) from jsonb_object_keys(observation))<>5 then raise exception 'Invalid observation' using errcode='22023'; end if;
    select value into question from jsonb_array_elements(attempt.public_content->'questions') where value->>'id'=observation->>'questionId';
    if not found or question->>'skillId' is distinct from observation->>'skillId' then raise exception 'Unknown observation' using errcode='22023'; end if;
    select value into answer from jsonb_array_elements(attempt.answers) where value->>'questionId'=observation->>'questionId';
    if not found or ((jsonb_typeof(answer->'choiceIds')='null') <> (observation->>'outcome'='skipped')) then
      raise exception 'Observation lacks answer' using errcode='22023'; end if;
    if observation->>'outcome'='skipped' then
      if jsonb_typeof(observation->'earnedPoints') is distinct from 'null' or jsonb_typeof(observation->'explanation') is distinct from 'null' then
        raise exception 'Skip cannot be graded' using errcode='22023'; end if;
    else
      if jsonb_typeof(observation->'earnedPoints') is distinct from 'number'
        or jsonb_typeof(observation->'explanation') is distinct from 'string' or char_length(observation->>'explanation')>1000
        or observation->>'outcome' not in ('correct','partial','incorrect') then raise exception 'Invalid grade' using errcode='22023'; end if;
      points:=(observation->>'earnedPoints')::numeric;
      if (observation->>'outcome'='correct' and points<>1) or (observation->>'outcome'='incorrect' and points<>0)
        or (observation->>'outcome'='partial' and (points<=0 or points>=1)) then raise exception 'Invalid points' using errcode='22023'; end if;
    end if;
  end loop;
  evaluated_time:=clock_timestamp();
  for finding in select value from jsonb_array_elements(p_evaluation->'findings') loop
    if jsonb_typeof(finding)<>'object' or not(finding ?& array['skillId','scope','status','answeredCount','questionCount','earnedPoints','possiblePoints','rationale'])
      or (select count(*) from jsonb_object_keys(finding))<>8
      or jsonb_typeof(finding->'scope') is distinct from 'string' or char_length(finding->>'scope') not between 1 and 400
      or jsonb_typeof(finding->'rationale') is distinct from 'string' or char_length(finding->>'rationale') not between 1 and 500 then
      raise exception 'Invalid finding' using errcode='22023'; end if;
    select count(*),count(*) filter(where value->>'outcome'<>'skipped'),coalesce(sum((value->>'earnedPoints')::numeric),0)
      into n_questions,n_answered,points from jsonb_array_elements(p_evaluation->'observations') where value->>'skillId'=finding->>'skillId';
    expected_status:=case when n_answered=0 then 'not_assessed'
      when exists(select 1 from jsonb_array_elements(p_evaluation->'observations') o where o->>'skillId'=finding->>'skillId' and o->>'outcome' in ('incorrect','partial')) then 'needs_review'
      when n_answered=n_questions then 'demonstrated' else 'learning' end;
    if n_questions<>2 or (finding->>'questionCount')::numeric is distinct from n_questions
      or (finding->>'possiblePoints')::numeric is distinct from n_questions
      or (finding->>'answeredCount')::numeric is distinct from n_answered or (finding->>'earnedPoints')::numeric is distinct from points
      or finding->>'status' is distinct from expected_status
      or not exists(select 1 from public.skills where id=finding->>'skillId') then
      raise exception 'Finding exceeds observed scope' using errcode='22023'; end if;
    evidence_id:=null; can_update:=false;
    if n_answered>0 then
      caveat:=left((finding->>'scope')||' '||(finding->>'rationale')||' '||
        (select string_agg(value#>>'{}',' ' order by ordinality) from jsonb_array_elements(p_evaluation->'limitations') with ordinality),1000);
      insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome,rubric_version,caveat,evaluated_at,assessment_attempt_id,scope)
        values(p_user_id,finding->>'skillId','quiz',p_attempt_id::text,
          case expected_status when 'demonstrated' then 'meets_criteria' when 'needs_review' then 'needs_practice' else 'inconclusive' end,
          attempt.rubric_version,caveat,evaluated_time,p_attempt_id,finding->>'scope') returning id into evidence_id;
      select status into prior_status from public.learner_skills where user_id=p_user_id and skill_id=finding->>'skillId';
      select e.* into prior_evidence from public.learner_skills s join public.skill_evidence e on e.id=s.last_evidence_id
        where s.user_id=p_user_id and s.skill_id=finding->>'skillId';
      can_update:=prior_evidence.id is null or prior_evidence.kind in ('self_report','ai_inference')
        or (prior_evidence.kind='quiz' and prior_evidence.scope=finding->>'scope'
          and (n_answered=n_questions or prior_status in ('not_assessed','learning')));
      if can_update then insert into public.learner_skills(user_id,skill_id,status,last_evidence_id,updated_at)
        values(p_user_id,finding->>'skillId',expected_status,evidence_id,evaluated_time)
        on conflict(user_id,skill_id) do update set status=excluded.status,last_evidence_id=excluded.last_evidence_id,updated_at=excluded.updated_at;
      end if;
    end if;
    findings:=findings||jsonb_build_array(finding||jsonb_build_object('evidenceId',evidence_id,'summaryUpdated',can_update));
  end loop;
  update public.diagnostic_attempts set status='evaluated',evaluation=p_evaluation||jsonb_build_object('findings',findings),
    evaluated_at=evaluated_time,updated_at=evaluated_time,revision=revision+1 where id=p_attempt_id returning * into attempt;
  receipt:=jsonb_build_object('attemptId',attempt.id,'revision',attempt.revision,'status',attempt.status);
  insert into public.diagnostic_mutations values(p_user_id,p_request_id,p_attempt_id,fingerprint,receipt);
  insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result)
    values(p_user_id,'diagnostic_evaluated',p_request_id,p_attempt_id,fingerprint,receipt);
  return receipt;
end;
$$;
revoke all on function public.start_diagnostic_attempt(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.save_diagnostic_answers(uuid,uuid,integer,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.evaluate_diagnostic_attempt(uuid,uuid,integer,jsonb,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.start_diagnostic_attempt(uuid,uuid,jsonb,text,text) to service_role;
grant execute on function public.save_diagnostic_answers(uuid,uuid,integer,jsonb,uuid) to service_role;
grant execute on function public.evaluate_diagnostic_attempt(uuid,uuid,integer,jsonb,jsonb,uuid) to service_role;
