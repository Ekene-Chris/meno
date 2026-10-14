-- Private bounded mentor turns; neither chat nor references award skill evidence.
create table public.mentor_turns (
 user_id uuid not null references public.profiles(id) on delete cascade,
 request_id uuid not null,
 goal_id uuid not null,
 course_id uuid,
 question text not null check(char_length(question) between 1 and 2000),
 input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
 context_hash text not null check(context_hash ~ '^[a-f0-9]{64}$'),
 context jsonb not null check(jsonb_typeof(context)='object' and octet_length(context::text)<=98304),
 model text not null check(char_length(model) between 1 and 100),
 policy_version text not null default 'mentor-v1' check(policy_version='mentor-v1'),
 status text not null default 'pending' check(status in ('pending','ready','failed')),
 result jsonb,
 error_code text check(error_code ~ '^[A-Z_]{1,40}$'),
 created_at timestamptz not null default now(),
 primary key(user_id,request_id),
 foreign key(goal_id,user_id) references public.learning_goals(id,user_id) on delete cascade,
 check((status='pending' and result is null and error_code is null) or (status='ready' and result is not null and error_code is null) or (status='failed' and result is null and error_code is not null)),
 check(result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=16384))
);
create index mentor_recent on public.mentor_turns(user_id,goal_id,created_at desc,request_id);
create index mentor_quota_recent on public.mentor_turns(created_at);
alter table public.mentor_turns enable row level security;
create policy read_own_mentor_turns on public.mentor_turns for select to authenticated using((select auth.uid())=user_id);
revoke all on public.mentor_turns from public,anon,authenticated;
grant select on public.mentor_turns to authenticated;
grant all on public.mentor_turns to service_role;
create view public.ai_request_activity with(security_invoker=true) as
 select user_id,created_at from public.outline_extractions union all select user_id,created_at from public.mentor_turns;
revoke all on public.ai_request_activity from public,anon,authenticated;
grant select on public.ai_request_activity to service_role;

create function public.mentor_context_for(p_user_id uuid,p_course_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb; active jsonb; recent jsonb; events jsonb; full_hash text;
begin
 snapshot:=public.learning_path_context_for(p_user_id,p_course_id);
 full_hash:=encode(sha256(convert_to((snapshot-'recentEvents')::text,'UTF8')),'hex');
 if jsonb_typeof(snapshot->'course')='object' then
  snapshot:=jsonb_set(snapshot,'{course,modules}',(select coalesce(jsonb_agg(module order by (module->>'position')::integer),'[]') from (select module from jsonb_array_elements(snapshot->'course'->'modules') module order by case when module->>'id'=snapshot->'course'->>'checkpointModuleId' then 0 else 1 end,(module->>'position')::integer limit 6) selected));
 end if;
 select jsonb_build_object('id',r.id,'revision',r.revision,'contextHash',r.context_hash,'courseId',r.context->'course'->'id','proposal',r.proposal)
 into active from public.learning_paths p join public.learning_path_revisions r on r.path_id=p.id and r.revision=p.active_revision
 where p.user_id=p_user_id and p.goal_id=(snapshot->'goal'->>'id')::uuid;
 -- Only relevant recent turns enter prompts. History is bounded and remains untrusted content.
 select coalesce(jsonb_agg(turn order by created_at,request_id),'[]') into recent from (
  select jsonb_build_object('question',question,'reply',left(result->>'reply',1600)) turn,created_at,request_id from public.mentor_turns
  where user_id=p_user_id and goal_id=(snapshot->'goal'->>'id')::uuid and course_id is not distinct from p_course_id and status='ready'
  order by created_at desc,request_id desc limit 3
 ) history;
 select coalesce(jsonb_agg(event order by occurred_at,id),'[]') into events from (
  select jsonb_build_object('type',type,'at',occurred_at) event,occurred_at,id from public.learning_events where user_id=p_user_id order by occurred_at desc,id desc limit 5
 ) activity;
 return jsonb_build_object('learning',snapshot,'learningContextHash',full_hash,'acceptedStep',active,'recentConversation',recent,'recentEvents',events);
end;
$$;
revoke all on function public.mentor_context_for(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mentor_context_for(uuid,uuid) to service_role;
create function public.get_mentor_context(p_course_id uuid default null,p_use_accepted_course boolean default true)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare learner uuid:=auth.uid(); course uuid:=p_course_id; snapshot jsonb;
begin
 if learner is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_use_accepted_course then
  select (r.context->'course'->>'id')::uuid into course from public.learning_paths p join public.learning_goals g on g.id=p.goal_id and g.status='active'
   join public.learning_path_revisions r on r.path_id=p.id and r.revision=p.active_revision where p.user_id=learner;
 end if;
 snapshot:=public.mentor_context_for(learner,course);
 return jsonb_build_object('context',snapshot,'contextHash',encode(sha256(convert_to((snapshot-'recentEvents')::text,'UTF8')),'hex'),'courseId',course);
end;
$$;
revoke all on function public.get_mentor_context(uuid,boolean) from public,anon;
grant execute on function public.get_mentor_context(uuid,boolean) to authenticated;

create function public.reserve_mentor_turn(p_user_id uuid,p_request_id uuid,p_question text,p_context_hash text,p_model text,p_daily_limit integer default 50,p_course_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.mentor_turns; snapshot jsonb; fingerprint text;
begin
 if p_user_id is null or p_request_id is null or p_question is null or char_length(p_question) not between 1 and 2000
  or p_question<>btrim(p_question) or p_model is null or char_length(p_model) not between 1 and 100
  or p_context_hash is null or p_context_hash !~ '^[a-f0-9]{64}$' or p_daily_limit is null or p_daily_limit not between 1 and 100 then
  raise exception 'Invalid question' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('question',p_question,'courseId',p_course_id,'contextHash',p_context_hash)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('meno:outline:quota',0));
 select * into prior from public.mentor_turns where user_id=p_user_id and request_id=p_request_id;
 if found then
  if prior.input_hash<>fingerprint then raise exception 'Request already used' using errcode='PT409'; end if;
  if prior.status='pending' and prior.created_at<now()-interval '2 minutes' then
   update public.mentor_turns set status='failed',error_code='AI_TIMEOUT' where user_id=p_user_id and request_id=p_request_id returning * into prior;
  end if;
  return jsonb_build_object('fresh',false,'status',prior.status,'result',prior.result,'errorCode',prior.error_code,'context',prior.context);
 end if;
 if exists(select 1 from public.outline_extractions where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request already used' using errcode='PT409'; end if;
 if exists(select 1 from public.mentor_turns where user_id=p_user_id and status='pending' and created_at>now()-interval '2 minutes') then raise exception 'Another question is pending' using errcode='PT425'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 snapshot:=public.mentor_context_for(p_user_id,p_course_id);
 if p_context_hash<>encode(sha256(convert_to((snapshot-'recentEvents')::text,'UTF8')),'hex') then raise exception 'Learning context changed' using errcode='PT409'; end if;
 if (select count(*) from public.ai_request_activity where user_id=p_user_id and created_at>now()-interval '1 minute')>=3
  or (select count(*) from public.ai_request_activity where user_id=p_user_id and created_at>now()-interval '24 hours')>=10
  or (select count(*) from public.ai_request_activity where created_at>now()-interval '24 hours')>=p_daily_limit then raise exception 'AI request limit' using errcode='PT429'; end if;
 insert into public.mentor_turns(user_id,request_id,goal_id,course_id,question,input_hash,context_hash,context,model)
  values(p_user_id,p_request_id,(snapshot->'learning'->'goal'->>'id')::uuid,p_course_id,p_question,fingerprint,p_context_hash,snapshot,p_model);
 return jsonb_build_object('fresh',true,'status','pending','context',snapshot);
end;
$$;
create function public.finish_mentor_turn(p_user_id uuid,p_request_id uuid,p_result jsonb,p_error_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare turn public.mentor_turns; failure text:=p_error_code; snapshot jsonb; item jsonb; field text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into turn from public.mentor_turns where user_id=p_user_id and request_id=p_request_id for update;
 if not found then raise exception 'Question not found' using errcode='PT404'; end if;
 if turn.status<>'pending' then return jsonb_build_object('status',turn.status,'result',turn.result,'errorCode',turn.error_code); end if;
 if failure is null and turn.created_at<now()-interval '2 minutes' then failure:='AI_TIMEOUT'; end if;
 if failure is null then
  begin snapshot:=public.mentor_context_for(p_user_id,turn.course_id);
  exception when sqlstate 'PT404' or sqlstate 'PT409' then failure:='MENTOR_CONTEXT_CHANGED'; end;
  if snapshot is not null and turn.context_hash<>encode(sha256(convert_to((snapshot-'recentEvents')::text,'UTF8')),'hex') then failure:='MENTOR_CONTEXT_CHANGED'; end if;
 end if;
 if failure is null then
  if p_result is null or jsonb_typeof(p_result)<>'object' or (select count(*) from jsonb_object_keys(p_result))<>7
   or not(p_result ?& array['action','reply','rationale','resourceIds','skillIds','evidenceIds','limitations'])
   or jsonb_typeof(p_result->'action') is distinct from 'string' or p_result->>'action' not in ('explain','clarify','recommend_resource')
   or jsonb_typeof(p_result->'reply') is distinct from 'string' or char_length(p_result->>'reply') not between 1 and 3000 or char_length(btrim(p_result->>'reply'))<1
   or p_result->>'reply' ~* '(https?://|www\.)' or p_result->>'rationale' ~* '(https?://|www\.)'
   or jsonb_typeof(p_result->'rationale') is distinct from 'string' or char_length(p_result->>'rationale') not between 1 and 600 or char_length(btrim(p_result->>'rationale'))<1 then
   raise exception 'Invalid explanation' using errcode='22023'; end if;
  for field in select unnest(array['resourceIds','skillIds','evidenceIds','limitations']) loop
   if jsonb_typeof(p_result->field) is distinct from 'array' or jsonb_array_length(p_result->field)>(case field when 'evidenceIds' then 5 when 'limitations' then 4 else 3 end)
    or (field='limitations' and jsonb_array_length(p_result->field)<1) then raise exception 'Invalid references' using errcode='22023'; end if;
   for item in select value from jsonb_array_elements(p_result->field) loop
    if jsonb_typeof(item)<>'string' then raise exception 'Invalid reference' using errcode='22023'; end if;
    if field='resourceIds' and not exists(select 1 from jsonb_array_elements(turn.context->'learning'->'resources') r where r->>'id'=item#>>'{}') then raise exception 'Unknown resource' using errcode='22023'; end if;
    if field='skillIds' and not exists(select 1 from jsonb_array_elements(turn.context->'learning'->'skills') s where s->>'id'=item#>>'{}') then raise exception 'Unknown skill' using errcode='22023'; end if;
    if field='evidenceIds' and not exists(select 1 from jsonb_array_elements(turn.context->'learning'->'skills') s where s->'evidence'->>'id'=item#>>'{}' and s->'evidence'->>'kind' in ('quiz','practical_task','externally_verified_project')) then raise exception 'Unknown evidence' using errcode='22023'; end if;
    if field='limitations' and (char_length(item#>>'{}') not between 1 and 400 or char_length(btrim(item#>>'{}'))<1 or item#>>'{}' ~* '(https?://|www\.)') then raise exception 'Invalid caveat' using errcode='22023'; end if;
   end loop;
  end loop;
 end if;
 update public.mentor_turns set status=case when failure is null then 'ready' else 'failed' end,result=case when failure is null then p_result else null end,error_code=failure where user_id=p_user_id and request_id=p_request_id;
 return jsonb_build_object('status',case when failure is null then 'ready' else 'failed' end,'result',case when failure is null then p_result else null end,'errorCode',failure);
end;
$$;
revoke all on function public.reserve_mentor_turn(uuid,uuid,text,text,text,integer,uuid),public.finish_mentor_turn(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.reserve_mentor_turn(uuid,uuid,text,text,text,integer,uuid),public.finish_mentor_turn(uuid,uuid,jsonb,text) to service_role;

-- Existing outline calls now share the same counters and reservation lock.
create or replace function public.reserve_outline_extraction(p_user_id uuid, p_request_id uuid, p_input_hash text,
  p_course_id uuid default null, p_expected_revision integer default 0, p_expected_confirmed_revision integer default null,
  p_model text default 'unconfigured', p_daily_limit integer default 50)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  previous public.outline_extractions;
  current_course public.courses;
begin
  if p_user_id is null or p_request_id is null or p_input_hash is null
    or p_input_hash !~ '^[a-f0-9]{64}$' or p_expected_revision is null
    or p_daily_limit is null or p_daily_limit not between 1 and 100
    or p_model is null or char_length(p_model) not between 1 and 100
    or ((p_course_id is null) <> (p_expected_revision = 0))
    or p_expected_revision < 0 or (p_course_id is null and p_expected_confirmed_revision is not null) then
    raise exception 'Invalid extraction request' using errcode = '22023';
  end if;
  -- This one short lock serializes quota reservations across server instances/accounts.
  perform pg_advisory_xact_lock(hashtextextended('meno:outline:quota',0));
  select * into previous from public.outline_extractions where user_id = p_user_id and request_id = p_request_id;
  if found then
    if previous.input_hash <> p_input_hash then raise exception 'Request already used' using errcode = 'PT409'; end if;
    if previous.status = 'pending' and previous.created_at < now() - interval '2 minutes' then
      update public.outline_extractions set status = 'failed', error_code = 'AI_TIMEOUT'
        where user_id = p_user_id and request_id = p_request_id;
      previous.status := 'failed';
      previous.error_code := 'AI_TIMEOUT';
    end if;
    return jsonb_build_object('fresh',false,'status',previous.status,'result',previous.result,
      'errorCode',previous.error_code,'createdAt',previous.created_at);
  end if;
  if exists(select 1 from public.mentor_turns where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request already used' using errcode='PT409'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Complete Passport first' using errcode = 'PT409';
  end if;
  if p_course_id is not null then
    select * into current_course from public.courses where id = p_course_id and user_id = p_user_id;
    if not found then raise exception 'Course not found' using errcode = 'PT404'; end if;
    if current_course.revision <> p_expected_revision
      or current_course.confirmed_revision is distinct from p_expected_confirmed_revision then
      raise exception 'Course has changed' using errcode = 'PT409';
    end if;
  end if;
  if (select count(*) from public.ai_request_activity where user_id = p_user_id and created_at > now() - interval '1 minute') >= 3
    or (select count(*) from public.ai_request_activity where user_id = p_user_id and created_at > now() - interval '24 hours') >= 10
    or (select count(*) from public.ai_request_activity where created_at > now() - interval '24 hours') >= p_daily_limit then
    raise exception 'Extraction limit reached' using errcode = 'PT429';
  end if;
  insert into public.outline_extractions(user_id,request_id,input_hash,course_id,expected_revision,expected_confirmed_revision,model)
    values (p_user_id,p_request_id,p_input_hash,p_course_id,p_expected_revision,p_expected_confirmed_revision,p_model);
  return jsonb_build_object('fresh',true,'status','pending');
end;
$$;

