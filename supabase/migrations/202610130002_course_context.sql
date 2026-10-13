-- C1: immutable course versions; draft edits never overwrite confirmed context.
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  revision integer not null check (revision > 0),
  confirmed_revision integer check (confirmed_revision > 0 and confirmed_revision <= revision),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index courses_owner_updated on public.courses(user_id, updated_at desc, id);

create table public.course_revisions (
  course_id uuid not null,
  user_id uuid not null,
  revision integer not null check (revision > 0),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  source_type text not null check (source_type in ('online_course', 'class', 'bootcamp', 'university', 'self_study', 'other')),
  source_url text check (char_length(source_url) <= 2048 and source_url ~ '^https?://[^/[:space:]@\\]+([/?#][^[:space:]\\]*)?$'),
  outline text not null check (char_length(outline) <= 12000),
  checkpoint_module_id uuid,
  checkpoint_note text check (char_length(checkpoint_note) between 1 and 500),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  primary key (course_id, revision),
  unique (course_id, revision, user_id),
  foreign key (course_id, user_id) references public.courses(id, user_id) on delete cascade
);
create index course_revisions_owner on public.course_revisions(user_id);

create table public.course_modules (
  course_id uuid not null,
  revision integer not null,
  user_id uuid not null,
  id uuid not null,
  position integer not null check (position between 0 and 29),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  topics jsonb not null check (jsonb_typeof(topics) = 'array' and jsonb_array_length(topics) <= 10 and octet_length(topics::text) <= 16384),
  primary key (course_id, revision, id),
  unique (course_id, revision, position),
  foreign key (course_id, revision, user_id) references public.course_revisions(course_id, revision, user_id) on delete cascade
);
create index course_modules_owner on public.course_modules(user_id);

alter table public.courses add constraint course_latest_revision_fk
  foreign key (id, revision) references public.course_revisions(course_id, revision) deferrable initially deferred;
alter table public.courses add constraint course_confirmed_revision_fk
  foreign key (id, confirmed_revision) references public.course_revisions(course_id, revision) deferrable initially deferred;
alter table public.course_revisions add constraint course_checkpoint_module_fk
  foreign key (course_id, revision, checkpoint_module_id) references public.course_modules(course_id, revision, id) deferrable initially deferred;

alter table public.courses enable row level security;
alter table public.course_revisions enable row level security;
alter table public.course_modules enable row level security;
create policy read_own_courses on public.courses for select to authenticated using ((select auth.uid()) = user_id);
create policy read_own_course_revisions on public.course_revisions for select to authenticated using ((select auth.uid()) = user_id);
create policy read_own_course_modules on public.course_modules for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.courses, public.course_revisions, public.course_modules from public, anon, authenticated;
grant select on public.courses, public.course_revisions, public.course_modules to authenticated;

-- A single-snapshot, paginatable summary without loading every historical outline.
create view public.course_summaries with (security_invoker = true) as
  select c.id, c.user_id, c.revision, c.confirmed_revision, c.updated_at, r.title, r.source_type
  from public.courses c join public.course_revisions r on r.course_id = c.id and r.revision = c.revision;
revoke all on public.course_summaries from public, anon, authenticated;
grant select on public.course_summaries to authenticated;

-- Retry receipts contain only a request fingerprint and revision IDs, never the outline.
alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check
  check (type in ('onboarding_completed', 'passport_updated', 'course_draft_saved', 'course_confirmed'));
alter table public.learning_events add column request_hash text check (request_hash ~ '^[a-f0-9]{64}$');
alter table public.learning_events add column result jsonb;
alter table public.learning_events add constraint course_event_receipt check (
  (type in ('course_draft_saved', 'course_confirmed') and request_hash is not null and result is not null
    and jsonb_typeof(result) = 'object' and octet_length(result::text) <= 256)
  or (type in ('onboarding_completed', 'passport_updated') and request_hash is null and result is null)
);

create function public.save_course_draft(p_expected_revision integer, p_input jsonb, p_request_id uuid, p_course_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  learner_id uuid := auth.uid();
  course_id uuid := p_course_id;
  current_course public.courses;
  receipt public.learning_events;
  fingerprint text;
  next_revision integer;
  module jsonb;
  topic jsonb;
  result jsonb;
begin
  if learner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_request_id is null or p_expected_revision is null or p_input is null
     or jsonb_typeof(p_input) <> 'object' or octet_length(p_input::text) > 65536 then
    raise exception 'Invalid course input' using errcode = '22023';
  end if;
  if not (p_input ?& array['title','source_type','source_url','outline','modules','checkpoint_module_id','checkpoint_note'])
     or exists (select 1 from jsonb_object_keys(p_input) f(name) where name not in
       ('title','source_type','source_url','outline','modules','checkpoint_module_id','checkpoint_note'))
     or jsonb_typeof(p_input->'title') <> 'string' or jsonb_typeof(p_input->'source_type') <> 'string'
     or jsonb_typeof(p_input->'outline') <> 'string' or jsonb_typeof(p_input->'modules') <> 'array'
     or jsonb_typeof(p_input->'source_url') not in ('string','null')
     or jsonb_typeof(p_input->'checkpoint_module_id') not in ('string','null')
     or jsonb_typeof(p_input->'checkpoint_note') not in ('string','null') then
    raise exception 'Invalid course fields' using errcode = '22023';
  end if;
  if jsonb_array_length(p_input->'modules') > 30 then
    raise exception 'Too many modules' using errcode = '22023';
  end if;
  for module in select value from jsonb_array_elements(p_input->'modules') loop
    if jsonb_typeof(module) <> 'object' then raise exception 'Invalid module' using errcode = '22023'; end if;
    if not (module ?& array['id','title','topics']) or exists (select 1 from jsonb_object_keys(module) f(name) where name not in ('id','title','topics'))
       or jsonb_typeof(module->'id') <> 'string' or jsonb_typeof(module->'title') <> 'string'
       or jsonb_typeof(module->'topics') <> 'array' then
      raise exception 'Invalid module fields' using errcode = '22023';
    end if;
    if jsonb_array_length(module->'topics') > 10 then raise exception 'Too many topics' using errcode = '22023'; end if;
    for topic in select value from jsonb_array_elements(module->'topics') loop
      if jsonb_typeof(topic) <> 'object' then raise exception 'Invalid topic' using errcode = '22023'; end if;
      if not (topic ?& array['label','skill_id']) or exists (select 1 from jsonb_object_keys(topic) f(name) where name not in ('label','skill_id'))
         or jsonb_typeof(topic->'label') <> 'string' or char_length(btrim(topic->>'label')) not between 1 and 120
         or jsonb_typeof(topic->'skill_id') not in ('string','null') then
        raise exception 'Invalid topic fields' using errcode = '22023';
      end if;
      if topic->>'skill_id' is not null and not exists (select 1 from public.skills where id = topic->>'skill_id') then
        raise exception 'Unknown skill' using errcode = '22023';
      end if;
    end loop;
  end loop;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_input->'modules')) <> jsonb_array_length(p_input->'modules') then
    raise exception 'Duplicate module ID' using errcode = '22023';
  end if;
  if p_input->>'checkpoint_module_id' is not null and not exists (
    select 1 from jsonb_array_elements(p_input->'modules') m where (m->>'id')::uuid = (p_input->>'checkpoint_module_id')::uuid
  ) then raise exception 'Checkpoint must belong to this course version' using errcode = '22023'; end if;
  if (p_course_id is null and p_expected_revision <> 0) or (p_course_id is not null and p_expected_revision < 1) then
    raise exception 'Invalid expected revision' using errcode = '22023';
  end if;

  fingerprint := encode(sha256(convert_to(jsonb_build_object('operation','save_course_draft','course_id',p_course_id,
    'expected_revision',p_expected_revision,'input',p_input)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(learner_id::text, 0));
  select * into receipt from public.learning_events where user_id = learner_id and request_id = p_request_id;
  if found then
    if receipt.request_hash is distinct from fingerprint then raise exception 'Request ID already used' using errcode = 'PT409'; end if;
    return receipt.result;
  end if;
  if not exists (select 1 from public.profiles where id = learner_id) then
    raise exception 'Complete your Passport first' using errcode = 'PT409';
  end if;
  if course_id is null then
    course_id := gen_random_uuid();
    next_revision := 1;
    insert into public.courses(id, user_id, revision) values (course_id, learner_id, next_revision);
  else
    select * into current_course from public.courses where id = course_id and user_id = learner_id for update;
    if not found then raise exception 'Course not found' using errcode = 'PT404'; end if;
    if current_course.revision <> p_expected_revision then raise exception 'Course has a newer revision' using errcode = 'PT409'; end if;
    next_revision := current_course.revision + 1;
    update public.courses set revision = next_revision, updated_at = now() where id = course_id;
  end if;
  insert into public.course_revisions(course_id, user_id, revision, title, source_type, source_url, outline, checkpoint_module_id, checkpoint_note)
    values (course_id, learner_id, next_revision, btrim(p_input->>'title'), p_input->>'source_type', nullif(btrim(p_input->>'source_url'), ''),
      btrim(p_input->>'outline'), (p_input->>'checkpoint_module_id')::uuid, nullif(btrim(p_input->>'checkpoint_note'), ''));
  insert into public.course_modules(course_id, user_id, revision, id, position, title, topics)
    select course_id, learner_id, next_revision, (m.value->>'id')::uuid, (m.ordinality - 1)::integer, btrim(m.value->>'title'), m.value->'topics'
    from jsonb_array_elements(p_input->'modules') with ordinality m(value, ordinality);
  result := jsonb_build_object('courseId',course_id,'revision',next_revision,'confirmedRevision',current_course.confirmed_revision);
  insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result)
    values (learner_id,'course_draft_saved',p_request_id,course_id,fingerprint,result);
  return result;
end;
$$;

create function public.confirm_course(p_course_id uuid, p_expected_revision integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  learner_id uuid := auth.uid();
  current_course public.courses;
  receipt public.learning_events;
  fingerprint text;
  result jsonb;
begin
  if learner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_course_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'Invalid confirmation' using errcode = '22023';
  end if;
  fingerprint := encode(sha256(convert_to(jsonb_build_object('operation','confirm_course','course_id',p_course_id,
    'expected_revision',p_expected_revision)::text, 'UTF8')), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(learner_id::text, 0));
  select * into receipt from public.learning_events where user_id = learner_id and request_id = p_request_id;
  if found then
    if receipt.request_hash is distinct from fingerprint then raise exception 'Request ID already used' using errcode = 'PT409'; end if;
    return receipt.result;
  end if;
  select * into current_course from public.courses where id = p_course_id and user_id = learner_id for update;
  if not found then raise exception 'Course not found' using errcode = 'PT404'; end if;
  if current_course.revision <> p_expected_revision or current_course.confirmed_revision = p_expected_revision then
    raise exception 'Review the current course revision' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.course_modules where course_id = p_course_id and revision = p_expected_revision)
     or exists (select 1 from public.course_modules where course_id = p_course_id and revision = p_expected_revision and jsonb_array_length(topics) = 0) then
    raise exception 'Add modules and topics before confirmation' using errcode = '22023';
  end if;
  update public.courses set confirmed_revision = p_expected_revision, updated_at = now() where id = p_course_id;
  update public.course_revisions set confirmed_at = now() where course_id = p_course_id and revision = p_expected_revision;
  result := jsonb_build_object('courseId',p_course_id,'revision',p_expected_revision,'confirmedRevision',p_expected_revision);
  insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result)
    values (learner_id,'course_confirmed',p_request_id,p_course_id,fingerprint,result);
  return result;
end;
$$;
revoke all on function public.save_course_draft(integer, jsonb, uuid, uuid) from public, anon;
revoke all on function public.confirm_course(uuid, integer, uuid) from public, anon;
grant execute on function public.save_course_draft(integer, jsonb, uuid, uuid) to authenticated;
grant execute on function public.confirm_course(uuid, integer, uuid) to authenticated;
