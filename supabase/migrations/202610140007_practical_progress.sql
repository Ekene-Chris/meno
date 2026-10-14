-- T2 records guided observations and a proposed follow-up atomically, without plan activation.
create table public.practical_progress (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 attempt_id uuid not null, result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=32768),
 created_at timestamptz not null default clock_timestamp(), unique(attempt_id,user_id), unique(id,user_id),
 foreign key(attempt_id,user_id) references public.practical_attempts(id,user_id) on delete cascade
);
create table public.practical_progress_receipts (
 user_id uuid not null references public.profiles(id) on delete cascade, request_id uuid not null,
 attempt_id uuid not null, content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'), progress_id uuid not null,
 primary key(user_id,request_id), foreign key(progress_id,user_id) references public.practical_progress(id,user_id) on delete cascade
);
alter table public.practical_progress enable row level security;
alter table public.practical_progress_receipts enable row level security;
create policy read_own_practical_progress on public.practical_progress for select to authenticated using((select auth.uid())=user_id);
create policy read_own_practical_progress_receipts on public.practical_progress_receipts for select to authenticated using((select auth.uid())=user_id);
revoke all on public.practical_progress,public.practical_progress_receipts from public,anon,authenticated;
grant select on public.practical_progress,public.practical_progress_receipts to authenticated;
grant select,insert,update,delete on public.practical_progress,public.practical_progress_receipts to service_role;
alter table public.skill_evidence add column practical_attempt_id uuid;
alter table public.skill_evidence add column assessment_method text check(assessment_method is null or assessment_method='guided_scaffold');
alter table public.skill_evidence add constraint practical_evidence_source check (
 (practical_attempt_id is null and assessment_method is null) or
 (practical_attempt_id is not null and assessment_method is not null and assessment_method='guided_scaffold' and kind='practical_task' and assessment_attempt_id is null and source_id=practical_attempt_id::text and scope is not null)
);
alter table public.skill_evidence add constraint practical_evidence_owner foreign key(practical_attempt_id,user_id) references public.practical_attempts(id,user_id) on delete cascade;
create unique index one_guided_finding_per_attempt on public.skill_evidence(practical_attempt_id,skill_id) where practical_attempt_id is not null;
alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check check(type in ('onboarding_completed','passport_updated','course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated','path_proposed','path_edited','path_accepted','path_declined','practical_started','practical_submitted','practical_progress_recorded'));
alter table public.learning_events drop constraint domain_event_receipt;
alter table public.learning_events add constraint domain_event_receipt check (
 (type in ('course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated','path_proposed','path_edited','path_accepted','path_declined','practical_started','practical_submitted','practical_progress_recorded') and request_hash is not null and result is not null and jsonb_typeof(result)='object' and octet_length(result::text)<=512)
 or (type in ('onboarding_completed','passport_updated') and request_hash is null and result is null)
);
create function public.record_practical_progress(p_user_id uuid,p_attempt_id uuid,p_request_id uuid,p_content_hash text,p_feedback jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt public.practical_attempts; prior public.practical_progress_receipts; progress public.practical_progress; previous public.skill_evidence; previous_status text;
 session jsonb; n integer; met integer; gap integer; status text; scope text; skill text; evidence uuid; can_update boolean; reason text; findings jsonb:='[]';
 first_gap text; first_missing text; action jsonb; outcome text; recorded timestamptz:=clock_timestamp(); assessment uuid:=gen_random_uuid(); result jsonb;
begin
 if p_user_id is null or p_attempt_id is null or p_request_id is null or p_content_hash is null or p_content_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid progress request' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into prior from public.practical_progress_receipts where user_id=p_user_id and request_id=p_request_id;
 if found then
  if prior.attempt_id<>p_attempt_id or prior.content_hash<>p_content_hash then raise exception 'Request reused' using errcode='PT409'; end if;
  select * into progress from public.practical_progress where id=prior.progress_id; return progress.result;
 end if;
 if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request reused' using errcode='PT409'; end if;
 select * into attempt from public.practical_attempts where id=p_attempt_id and user_id=p_user_id for update;
 if not found then raise exception 'Attempt not found' using errcode='PT404'; end if;
 if attempt.status<>'submitted' or attempt.content_hash<>p_content_hash then raise exception 'Submit or reload first' using errcode='PT409'; end if;
 select * into progress from public.practical_progress where attempt_id=p_attempt_id and user_id=p_user_id;
 if found then
  insert into public.practical_progress_receipts values(p_user_id,p_request_id,p_attempt_id,p_content_hash,progress.id);
  return progress.result;
 end if;
 if p_feedback is null or p_feedback is distinct from attempt.feedback or attempt.rubric_version<>'guided-api-rubric-v1' or p_content_hash is distinct from (select content_hash from public.practical_catalog where id=attempt.catalog_id) then raise exception 'Unsupported or changed assessment' using errcode='22023'; end if;
 recorded:=clock_timestamp();
 for session in select value from jsonb_array_elements(attempt.public_content->'sessions') loop
  skill:=session->'slots'->0->>'skillId';
  select count(*) filter(where c->>'status'<>'inconclusive'),count(*) filter(where c->>'status'='met'),count(*) filter(where c->>'status'='needs_review') into n,met,gap from jsonb_array_elements(p_feedback->'criteria') c where c->>'skillId'=skill;
  if n not between 0 and 4 or met+gap<>n or not exists(select 1 from public.skills where id=skill) then raise exception 'Unsupported finding' using errcode='22023'; end if;
  status:=case when n=0 then 'not_assessed' when gap>0 then 'needs_review' when n=4 then 'demonstrated' else 'learning' end;
  scope:=case skill when 'js.promises' then 'Guided scaffold: returned values, chained callback, rejection handler and promise-order trace.' when 'web.fetch-api' then 'Guided scaffold: HTTP-status guard, awaited JSON, parsed field and HTTP-error trace.' when 'web.dom' then 'Guided scaffold: loading feedback, textContent, visible error and failure-state trace.' else null end;
  if scope is null then raise exception 'Unsupported skill' using errcode='22023'; end if;
  if gap>0 and first_gap is null then first_gap:=skill; end if;
  if n<4 and first_missing is null then first_missing:=skill; end if;
  evidence:=null; can_update:=false; reason:='unobserved'; previous:=null; previous_status:=null;
  if n>0 then
   insert into public.skill_evidence(user_id,skill_id,kind,source_id,outcome,rubric_version,caveat,evaluated_at,practical_attempt_id,assessment_method,scope)
   values(p_user_id,skill,'practical_task',attempt.id::text,case status when 'demonstrated' then 'meets_criteria' when 'needs_review' then 'needs_practice' else 'inconclusive' end,attempt.rubric_version,
    scope||' Fixed choices and traces only; not an independently built or executed app. Code/reflection, authorship, broad mastery and career qualification are unassessed.',recorded,attempt.id,'guided_scaffold',scope) returning id into evidence;
   select e.* into previous from public.learner_skills s left join public.skill_evidence e on e.id=s.last_evidence_id where s.user_id=p_user_id and s.skill_id=skill;
   select s.status into previous_status from public.learner_skills s where s.user_id=p_user_id and s.skill_id=skill;
   -- Old submitted work must not displace a later observation simply because it was recorded late.
   if previous.id is null or previous.kind in ('self_report','ai_inference') then can_update:=true; reason:='updated';
   elsif coalesce((select submitted_at from public.practical_attempts where id=previous.practical_attempt_id),previous.evaluated_at)>attempt.submitted_at then reason:='newer_observation';
   elsif (previous.kind='quiz' or (previous.assessment_method='guided_scaffold' and previous.scope=scope)) then
    if n=4 or previous_status in ('not_assessed','learning') then can_update:=true;reason:='updated'; else reason:='complete_prior_observation'; end if;
   else reason:='stronger_or_different_scope'; end if;
   if can_update then insert into public.learner_skills(user_id,skill_id,status,last_evidence_id,updated_at) values(p_user_id,skill,status,evidence,recorded)
    on conflict(user_id,skill_id) do update set status=excluded.status,last_evidence_id=excluded.last_evidence_id,updated_at=excluded.updated_at; end if;
  end if;
  findings:=findings||jsonb_build_array(jsonb_build_object('skillId',skill,'scope',scope,'status',status,'observedCount',n,'metCount',met,'criterionCount',4,'evidenceId',evidence,'summaryUpdated',can_update,'preservationReason',reason));
 end loop;
 outcome:=case when p_feedback->>'outcome'='meets_guided_rubric' then 'guided_complete' when p_feedback->>'outcome'='needs_review' then 'needs_review' else 'inconclusive' end;
 action:=case when first_gap is not null then jsonb_build_object('kind','review_gap','skillId',first_gap,'title','Review one observed scaffold gap','reason','At least one chosen line or trace needs review in this fixed scope. Earlier broader evidence is retained.','steps',jsonb_build_array('Review the saved criterion feedback and explain a different choice in your own words.','Start another practice when you want to check the revised choice.'))
 when first_missing is not null and attempt.input->>'mode'='guided' then jsonb_build_object('kind','finish_guided','skillId',first_missing,'title','Explore an unanswered part','reason','Missing choices are unknown, not failures. The saved submission remains immutable.','steps',jsonb_build_array('Start another practice and work through one unanswered session at your pace.'))
 when outcome='guided_complete' then jsonb_build_object('kind','independent_practice','skillId','js.promises','title','Try a small example without the scaffold','reason','All fixed guided criteria were met. Independent construction and runtime behavior remain unverified.','steps',jsonb_build_array('Draft a small promise-based example in your own words and code, including success and failure paths.','Discuss one design choice with your mentor; this does not automatically grade the new code.'))
 else jsonb_build_object('kind','mentor_help','skillId',null,'title','Choose a checkable next step with your mentor','reason','Free-form text is saved but this rubric cannot assess its correctness.','steps',jsonb_build_array('Explain one question to your mentor or choose guided practice for bounded feedback.')) end;
 action:=action||jsonb_build_object('limitations',jsonb_build_array('This is a suggested follow-up for the recorded exercise, not an activated learning plan.','Guided observations do not prove independent app-building or career readiness.','The accepted task and course checkpoint are unchanged.'));
 result:=jsonb_build_object('assessmentId',assessment,'attemptId',attempt.id,'policyVersion','guided-progress-v1','method','guided_scaffold','recordedAt',recorded,'exerciseStatus',outcome,'acceptedTaskCompleted',false,'findings',findings,'nextAction',action);
 insert into public.practical_progress(id,user_id,attempt_id,result,created_at) values(assessment,p_user_id,attempt.id,result,recorded);
 insert into public.practical_progress_receipts values(p_user_id,p_request_id,p_attempt_id,p_content_hash,assessment);
 insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result) values(p_user_id,'practical_progress_recorded',p_request_id,attempt.id,encode(sha256(convert_to(jsonb_build_object('attempt',attempt.id,'hash',p_content_hash)::text,'UTF8')),'hex'),jsonb_build_object('assessmentId',assessment,'attemptId',attempt.id));
 return result;
end;
$$;
revoke all on function public.record_practical_progress(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_practical_progress(uuid,uuid,uuid,text,jsonb) to service_role;
-- Preserve the legacy context representation for existing observations; add guided provenance only when present.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.learning_path_context_for(uuid,uuid)'::regprocedure);
 definition:=replace(definition,'''attemptId'',e.assessment_attempt_id)', '''attemptId'',coalesce(e.assessment_attempt_id,e.practical_attempt_id)) || case when e.assessment_method is null then ''{}''::jsonb else jsonb_build_object(''method'',e.assessment_method) end');
 execute definition;
end $$;

-- Submission time is the source observation time, including within a longer transaction.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('public.mutate_practical_attempt(uuid,uuid,uuid,integer,text,jsonb,jsonb)'::regprocedure);
 definition:=replace(definition,'updated_at=now(),submitted_at=case when p_operation=''submit'' then now()', 'updated_at=clock_timestamp(),submitted_at=case when p_operation=''submit'' then clock_timestamp()');
 execute definition;
end $$;
