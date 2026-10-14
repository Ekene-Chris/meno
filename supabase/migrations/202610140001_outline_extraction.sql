-- AI proposals are private, separate from confirmed course context and assessed evidence.
-- Only the server reserves/finalizes requests; learner sessions can read their own proposals.
create table public.outline_extractions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  course_id uuid,
  expected_revision integer not null check (expected_revision >= 0),
  expected_confirmed_revision integer,
  model text not null check (char_length(model) between 1 and 100),
  status text not null default 'pending' check (status in ('pending','ready','failed')),
  result jsonb,
  error_code text check (error_code ~ '^[A-Z_]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id),
  check ((status = 'ready' and result is not null and error_code is null)
      or (status = 'failed' and result is null and error_code is not null)
      or (status = 'pending' and result is null and error_code is null)),
  check (result is null or (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 32768))
);
create index outline_extractions_recent on public.outline_extractions(created_at);
create index outline_extractions_owner_recent on public.outline_extractions(user_id, created_at);
alter table public.outline_extractions enable row level security;
create policy read_own_outline_extractions on public.outline_extractions for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on public.outline_extractions from public, anon, authenticated;
grant select on public.outline_extractions to authenticated;
grant select, insert, update, delete on public.outline_extractions to service_role;

create function public.reserve_outline_extraction(p_user_id uuid, p_request_id uuid, p_input_hash text,
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
  if (select count(*) from public.outline_extractions where user_id = p_user_id and created_at > now() - interval '1 minute') >= 3
    or (select count(*) from public.outline_extractions where user_id = p_user_id and created_at > now() - interval '24 hours') >= 10
    or (select count(*) from public.outline_extractions where created_at > now() - interval '24 hours') >= p_daily_limit then
    raise exception 'Extraction limit reached' using errcode = 'PT429';
  end if;
  insert into public.outline_extractions(user_id,request_id,input_hash,course_id,expected_revision,expected_confirmed_revision,model)
    values (p_user_id,p_request_id,p_input_hash,p_course_id,p_expected_revision,p_expected_confirmed_revision,p_model);
  return jsonb_build_object('fresh',true,'status','pending');
end;
$$;

create function public.finish_outline_extraction(p_user_id uuid, p_request_id uuid, p_result jsonb, p_error_code text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  request public.outline_extractions;
  current_course public.courses;
  failure text := p_error_code;
  module jsonb;
  topic jsonb;
begin
  select * into request from public.outline_extractions where user_id = p_user_id and request_id = p_request_id for update;
  if not found then raise exception 'Request not found' using errcode = 'PT404'; end if;
  if request.status <> 'pending' then
    return jsonb_build_object('status',request.status,'result',request.result,'errorCode',request.error_code);
  end if;
  if failure is null and request.created_at < now() - interval '2 minutes' then failure := 'AI_TIMEOUT'; end if;
  if failure is null and request.course_id is not null then
    select * into current_course from public.courses where id = request.course_id and user_id = p_user_id for share;
    if not found then failure := 'COURSE_NOT_FOUND';
    elsif current_course.revision <> request.expected_revision
      or current_course.confirmed_revision is distinct from request.expected_confirmed_revision then
      failure := 'COURSE_CONFLICT';
    end if;
  end if;
  if failure is null then
    if p_result is null or jsonb_typeof(p_result) <> 'object' or not (p_result ? 'modules')
      or (select count(*) from jsonb_object_keys(p_result)) <> 1
      or jsonb_typeof(p_result->'modules') <> 'array' or jsonb_array_length(p_result->'modules') > 20
      or octet_length(p_result::text) > 32768 then
      raise exception 'Invalid proposal' using errcode = '22023';
    end if;
    for module in select value from jsonb_array_elements(p_result->'modules') loop
      if jsonb_typeof(module) <> 'object' or not (module ?& array['title','topics'])
        or (select count(*) from jsonb_object_keys(module)) <> 2
        or jsonb_typeof(module->'title') <> 'string' or char_length(btrim(module->>'title')) not between 1 and 160
        or jsonb_typeof(module->'topics') <> 'array' or jsonb_array_length(module->'topics') not between 1 and 10 then
        raise exception 'Invalid module' using errcode = '22023';
      end if;
      for topic in select value from jsonb_array_elements(module->'topics') loop
        if jsonb_typeof(topic) <> 'object' or not (topic ?& array['label','skill_id','mapping'])
          or (select count(*) from jsonb_object_keys(topic)) <> 3
          or jsonb_typeof(topic->'label') <> 'string' or char_length(btrim(topic->>'label')) not between 1 and 120
          or jsonb_typeof(topic->'skill_id') not in ('string','null')
          or jsonb_typeof(topic->'mapping') <> 'string' or topic->>'mapping' not in ('suggested','uncertain','unmapped')
          or ((topic->>'skill_id' is null) <> (topic->>'mapping' = 'unmapped')) then
          raise exception 'Invalid topic' using errcode = '22023';
        end if;
        if topic->>'skill_id' is not null and not exists (select 1 from public.skills where id = topic->>'skill_id') then
          raise exception 'Unknown skill' using errcode = '22023';
        end if;
      end loop;
    end loop;
  end if;
  update public.outline_extractions set status = case when failure is null then 'ready' else 'failed' end,
    result = case when failure is null then p_result else null end, error_code = failure
    where user_id = p_user_id and request_id = p_request_id;
  return jsonb_build_object('status',case when failure is null then 'ready' else 'failed' end,
    'result',case when failure is null then p_result else null end,'errorCode',failure);
end;
$$;
revoke all on function public.reserve_outline_extraction(uuid,uuid,text,uuid,integer,integer,text,integer) from public, anon, authenticated;
revoke all on function public.finish_outline_extraction(uuid,uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.reserve_outline_extraction(uuid,uuid,text,uuid,integer,integer,text,integer) to service_role;
grant execute on function public.finish_outline_extraction(uuid,uuid,jsonb,text) to service_role;
