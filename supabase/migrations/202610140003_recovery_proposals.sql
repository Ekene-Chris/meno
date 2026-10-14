-- P1: immutable milestone proposals. No proposal automatically becomes an active plan.
-- Supabase applies migrations before seed.sql. Initialize the shared v1 catalog here
-- before resource foreign keys; preserve existing metadata on already configured projects.
-- Shared demonstration curriculum only. No learner results or accounts are seeded.
insert into public.skills(id, name, description, position) values
  ('web.html-basics', 'HTML foundations', 'Structure a page with meaningful HTML.', 1),
  ('web.css-layout', 'CSS layouts', 'Create responsive layouts with CSS.', 2),
  ('js.variables', 'Variables and values', 'Choose and work with JavaScript values.', 3),
  ('js.conditions', 'Conditions', 'Express decisions with conditional logic.', 4),
  ('js.functions', 'Functions', 'Define and call functions with inputs and return values.', 5),
  ('js.arrays', 'Arrays', 'Work with collections and array methods.', 6),
  ('js.objects', 'Objects', 'Represent and access structured data.', 7),
  ('web.dom', 'The DOM', 'Read and update page content through the DOM.', 8),
  ('web.http-basics', 'HTTP foundations', 'Explain requests, responses, and status codes.', 9),
  ('js.promises', 'Promises', 'Reason about pending, fulfilled, and rejected operations.', 10),
  ('js.async-await', 'Async and await', 'Sequence asynchronous work and handle failures.', 11),
  ('web.fetch-api', 'Fetching API data', 'Request data and handle loading and error states.', 12),
  ('git.basics', 'Git foundations', 'Record and explain changes in version control.', 13),
  ('web.accessibility', 'Accessible interfaces', 'Use labels, semantic elements, and keyboard interaction.', 14)
on conflict (id) do nothing;

insert into public.skill_prerequisites(skill_id, prerequisite_skill_id) values
  ('web.css-layout', 'web.html-basics'), ('js.conditions', 'js.variables'),
  ('js.functions', 'js.variables'), ('js.arrays', 'js.functions'), ('js.objects', 'js.variables'),
  ('web.dom', 'web.html-basics'), ('web.dom', 'js.functions'), ('js.promises', 'js.functions'),
  ('js.async-await', 'js.promises'), ('web.fetch-api', 'web.http-basics'),
  ('web.fetch-api', 'js.async-await'), ('web.fetch-api', 'js.objects'), ('web.accessibility', 'web.html-basics')
on conflict do nothing;

create table public.learning_resources (
  id text primary key check (char_length(id) between 1 and 80),
  skill_id text not null references public.skills(id),
  title text not null check (char_length(title) between 1 and 160),
  source_url text not null check (source_url like 'https://developer.mozilla.org/en-US/docs/%' and char_length(source_url)<=2048),
  provider text not null default 'MDN' check (provider='MDN'),
  language text not null default 'en' check (language='en'),
  format text not null default 'text' check (format='text'),
  data_cost text not null default 'unknown' check (data_cost='unknown'),
  duration_minutes integer check (duration_minutes is null),
  quality_status text not null default 'reviewed' check (quality_status in ('reviewed','needs_review','unavailable')),
  checked_at date not null,
  review_after date not null check (review_after>=checked_at)
);
insert into public.learning_resources(id,skill_id,title,source_url,checked_at,review_after) values
 ('mdn-html-v1','web.html-basics','Basic HTML syntax','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Basic_HTML_syntax','2026-10-14','2027-01-12'),
 ('mdn-layout-v1','web.css-layout','Introduction to CSS layout','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/CSS_layout/Introduction','2026-10-14','2027-01-12'),
 ('mdn-variables-v1','js.variables','Variables','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Variables','2026-10-14','2027-01-12'),
 ('mdn-functions-v1','js.functions','Functions — reusable blocks of code','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Functions','2026-10-14','2027-01-12'),
 ('mdn-arrays-v1','js.arrays','Arrays','https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Arrays','2026-10-14','2027-01-12'),
 ('mdn-promises-v1','js.promises','How to use promises','https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Async_JS/Promises','2026-10-14','2027-01-12');
alter table public.learning_resources enable row level security;
create policy read_learning_resources on public.learning_resources for select to authenticated using (true);
revoke all on public.learning_resources from public,anon,authenticated;
grant select on public.learning_resources to authenticated;
grant all on public.learning_resources to service_role;

alter table public.learning_goals add constraint goal_owner_unique unique(id,user_id);
create table public.learning_paths (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_id uuid not null,
  revision integer not null check (revision>0),
  active_revision integer check (active_revision>0 and active_revision<=revision),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id),
  unique(user_id,goal_id),
  foreign key(goal_id,user_id) references public.learning_goals(id,user_id) on delete cascade
);
create table public.learning_path_revisions (
  id uuid primary key default gen_random_uuid(),
  path_id uuid not null,
  user_id uuid not null,
  revision integer not null check (revision>0),
  selector_version text not null check (selector_version='recovery-v1'),
  context_hash text not null check (context_hash ~ '^[a-f0-9]{64}$'),
  context jsonb not null check (jsonb_typeof(context)='object' and octet_length(context::text)<=32768),
  proposal jsonb not null check (jsonb_typeof(proposal)='object' and octet_length(proposal::text)<=16384),
  created_at timestamptz not null default now(),
  unique(id,user_id),
  unique(path_id,revision,user_id),
  foreign key(path_id,user_id) references public.learning_paths(id,user_id) on delete cascade
);
alter table public.learning_paths add constraint latest_path_revision
  foreign key(id,revision,user_id) references public.learning_path_revisions(path_id,revision,user_id) deferrable initially deferred;
alter table public.learning_paths add constraint active_path_revision
  foreign key(id,active_revision,user_id) references public.learning_path_revisions(path_id,revision,user_id) deferrable initially deferred;
create index path_revisions_recent on public.learning_path_revisions(user_id,path_id,revision desc);
create table public.learning_path_mutations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  expected_revision integer not null check (expected_revision>=0),
  course_id uuid,
  proposal_id uuid not null,
  result jsonb not null check (jsonb_typeof(result)='object' and octet_length(result::text)<=512),
  primary key(user_id,request_id),
  foreign key(proposal_id,user_id) references public.learning_path_revisions(id,user_id) on delete cascade
);
alter table public.learning_paths enable row level security;
alter table public.learning_path_revisions enable row level security;
alter table public.learning_path_mutations enable row level security;
create policy read_own_paths on public.learning_paths for select to authenticated using ((select auth.uid())=user_id);
create policy read_own_path_revisions on public.learning_path_revisions for select to authenticated using ((select auth.uid())=user_id);
create policy read_own_path_receipts on public.learning_path_mutations for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.learning_paths,public.learning_path_revisions,public.learning_path_mutations from public,anon,authenticated;
grant select on public.learning_paths,public.learning_path_revisions,public.learning_path_mutations to authenticated;
grant all on public.learning_paths,public.learning_path_revisions,public.learning_path_mutations to service_role;

-- One SQL statement captures only the context selection actually uses: no outlines, answers,
-- motivation, checkpoint notes, display names or conversation content.
create function public.learning_path_context_for(p_user_id uuid,p_course_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if p_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_course_id is not null and not exists(select 1 from public.courses where id=p_course_id and user_id=p_user_id) then
    raise exception 'Course not found' using errcode='PT404'; end if;
  if p_course_id is not null and exists(select 1 from public.courses where id=p_course_id and confirmed_revision is null) then
    raise exception 'Confirm course first' using errcode='PT409'; end if;
  select jsonb_build_object(
    'goal',jsonb_build_object('id',g.id,'desiredSkill',g.desired_skill,'targetRole',g.target_role),
    'learner',jsonb_build_object('entryState',p.entry_state,'studyMinutesPerWeek',p.study_minutes_per_week,'device',p.device,'bandwidth',p.bandwidth,'locale',p.locale),
    'skills',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.name,'position',s.position,'status',coalesce(ls.status,'not_assessed'),
      'evidence',case when e.id is null then null else jsonb_build_object('id',e.id,'kind',e.kind,'outcome',e.outcome,'scope',e.scope,'rubricVersion',e.rubric_version,'attemptId',e.assessment_attempt_id) end
    ) order by s.position,s.id),'[]') from public.skills s
      left join public.learner_skills ls on ls.skill_id=s.id and ls.user_id=p_user_id
      left join public.skill_evidence e on e.id=ls.last_evidence_id and e.user_id=p_user_id),
    'prerequisites',(select coalesce(jsonb_agg(jsonb_build_object('skillId',skill_id,'prerequisiteSkillId',prerequisite_skill_id) order by skill_id,prerequisite_skill_id),'[]') from public.skill_prerequisites),
    'course',(select jsonb_build_object('id',c.id,'revision',c.confirmed_revision,'title',r.title,'checkpointModuleId',r.checkpoint_module_id,
      'modules',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'position',m.position,
        'skillIds',(select coalesce(jsonb_agg(skill_id order by skill_id),'[]') from
          (select distinct topic->>'skill_id' skill_id from jsonb_array_elements(m.topics) topic where jsonb_typeof(topic->'skill_id')='string') mapped)
      ) order by m.position),'[]') from public.course_modules m where m.course_id=c.id and m.revision=c.confirmed_revision))
      from public.courses c join public.course_revisions r on r.course_id=c.id and r.revision=c.confirmed_revision
      where c.id=p_course_id and c.user_id=p_user_id),
    'resources',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'skillId',skill_id,'title',title,'sourceUrl',source_url,
      'provider',provider,'language',language,'format',format,'dataCost',data_cost,'durationMinutes',duration_minutes,
      'checkedAt',checked_at,'reviewAfter',review_after) order by id),'[]')
      from public.learning_resources where quality_status='reviewed' and checked_at<=current_date and review_after>=current_date)
  ) into snapshot from public.profiles p join public.learning_goals g on g.user_id=p.id and g.status='active' where p.id=p_user_id;
  if snapshot is null then raise exception 'Passport required' using errcode='PT409'; end if;
  if octet_length(snapshot::text)>32768 then raise exception 'Context too large' using errcode='22023'; end if;
  return snapshot;
end;
$$;
revoke all on function public.learning_path_context_for(uuid,uuid) from public,anon,authenticated;
grant execute on function public.learning_path_context_for(uuid,uuid) to service_role;

create function public.get_learning_path_context(p_course_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare learner uuid:=auth.uid(); snapshot jsonb; path public.learning_paths;
begin
  snapshot:=public.learning_path_context_for(learner,p_course_id);
  select * into path from public.learning_paths where user_id=learner and goal_id=(snapshot->'goal'->>'id')::uuid;
  return jsonb_build_object('context',snapshot,'contextHash',encode(sha256(convert_to(snapshot::text,'UTF8')),'hex'),
    'pathId',path.id,'revision',coalesce(path.revision,0),'activeRevision',path.active_revision);
end;
$$;
revoke all on function public.get_learning_path_context(uuid) from public,anon;
grant execute on function public.get_learning_path_context(uuid) to authenticated;

alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check check (type in
 ('onboarding_completed','passport_updated','course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated','path_proposed'));
alter table public.learning_events drop constraint domain_event_receipt;
alter table public.learning_events add constraint domain_event_receipt check (
 (type in ('course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated','path_proposed')
   and request_hash is not null and result is not null and jsonb_typeof(result)='object' and octet_length(result::text)<=512)
 or (type in ('onboarding_completed','passport_updated') and request_hash is null and result is null)
);

create function public.propose_learning_path(p_user_id uuid,p_expected_revision integer,p_context_hash text,p_selector_version text,p_proposal jsonb,p_request_id uuid,p_course_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.learning_path_mutations; snapshot jsonb; path public.learning_paths; proposal_id uuid; receipt jsonb; evidence_id jsonb; anchor jsonb; resource jsonb; item jsonb; selected_skill jsonb;
begin
  if p_user_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<0 then
    raise exception 'Invalid request' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into prior from public.learning_path_mutations where user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.expected_revision is distinct from p_expected_revision or prior.course_id is distinct from p_course_id then
      raise exception 'Request already used' using errcode='PT409'; end if;
    return prior.result;
  end if;
  if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request already used' using errcode='PT409'; end if;
  snapshot:=public.learning_path_context_for(p_user_id,p_course_id);
  if p_context_hash is null or p_context_hash is distinct from encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') then
    raise exception 'Learning context changed' using errcode='PT409'; end if;
  select * into path from public.learning_paths where user_id=p_user_id and goal_id=(snapshot->'goal'->>'id')::uuid for update;
  if coalesce(path.revision,0)<>p_expected_revision then raise exception 'Plan changed' using errcode='PT409'; end if;
  if p_selector_version is distinct from 'recovery-v1' or p_proposal is null or jsonb_typeof(p_proposal)<>'object' or octet_length(p_proposal::text)>16384
    or not(p_proposal ?& array['policyVersion','skillId','mode','title','estimatedMinutes','steps','reasons','basis','resource','courseAnchor','demoConnection','limitations'])
    or (select count(*) from jsonb_object_keys(p_proposal))<>12
    or p_proposal->>'policyVersion' is distinct from p_selector_version
    or jsonb_typeof(p_proposal->'mode') is distinct from 'string'
    or p_proposal->>'mode' not in ('start','review','practice')
    or jsonb_typeof(p_proposal->'title') is distinct from 'string' or char_length(p_proposal->>'title') not between 1 and 160
    or jsonb_typeof(p_proposal->'estimatedMinutes') is distinct from 'number' or (p_proposal->>'estimatedMinutes')::numeric not in (5,15,25)
    or jsonb_typeof(p_proposal->'steps') is distinct from 'array' or jsonb_array_length(p_proposal->'steps') not between 2 and 4
    or jsonb_typeof(p_proposal->'reasons') is distinct from 'array' or jsonb_array_length(p_proposal->'reasons') not between 1 and 5
    or jsonb_typeof(p_proposal->'limitations') is distinct from 'array' or jsonb_array_length(p_proposal->'limitations') not between 2 and 6
    or not exists(select 1 from public.skills where id=p_proposal->>'skillId') then
    raise exception 'Invalid proposal' using errcode='22023'; end if;
  select value into resource from jsonb_array_elements(snapshot->'resources') where value->>'id'=p_proposal->'resource'->>'id' and value->>'skillId'=p_proposal->>'skillId';
  if resource is null or resource is distinct from p_proposal->'resource' then raise exception 'Unreviewed resource' using errcode='22023'; end if;
  if jsonb_typeof(p_proposal->'basis') is distinct from 'object' or jsonb_typeof(p_proposal->'basis'->'evidenceIds') is distinct from 'array'
    or jsonb_array_length(p_proposal->'basis'->'evidenceIds')>50
    or not(p_proposal->'basis' ?& array['category','evidenceIds','preservedSkills','unknownPrerequisites'])
    or (select count(*) from jsonb_object_keys(p_proposal->'basis'))<>4
    or jsonb_typeof(p_proposal->'basis'->'category') is distinct from 'string'
    or p_proposal->'basis'->>'category' not in ('observed_gap','prerequisite_review','incomplete_observation','unassessed_start','course_continuation','practical_extension')
    or jsonb_typeof(p_proposal->'basis'->'preservedSkills') is distinct from 'array'
    or jsonb_typeof(p_proposal->'basis'->'unknownPrerequisites') is distinct from 'array'
    or jsonb_array_length(p_proposal->'basis'->'preservedSkills')>50 or jsonb_array_length(p_proposal->'basis'->'unknownPrerequisites')>50 then
    raise exception 'Invalid basis' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_proposal->'steps') loop
    if jsonb_typeof(item)<>'string' or char_length(item#>>'{}') not between 1 and 400 then raise exception 'Invalid task step' using errcode='22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements((p_proposal->'reasons')||(p_proposal->'limitations')) loop
    if jsonb_typeof(item)<>'string' or char_length(item#>>'{}') not between 1 and 600 then raise exception 'Invalid explanation' using errcode='22023'; end if;
  end loop;
  select value into selected_skill from jsonb_array_elements(snapshot->'skills') where value->>'id'=p_proposal->>'skillId';
  if p_proposal->>'mode' in ('review','practice') then
    if selected_skill->'evidence'->>'kind' is null or selected_skill->'evidence'->>'kind' not in ('quiz','practical_task','externally_verified_project')
      or selected_skill->>'status' is distinct from (case when p_proposal->>'mode'='review' then 'needs_review' else 'demonstrated' end)
      or not(p_proposal->'basis'->'evidenceIds' ? (selected_skill->'evidence'->>'id')) then
      raise exception 'Mode exceeds observed evidence' using errcode='22023'; end if;
  end if;
  for item in select value from jsonb_array_elements(p_proposal->'basis'->'preservedSkills') loop
    if jsonb_typeof(item)<>'string' or not exists(select 1 from jsonb_array_elements(snapshot->'skills') s where s->>'id'=item#>>'{}'
      and s->>'status'='demonstrated' and s->'evidence'->>'kind' in ('quiz','practical_task','externally_verified_project')
      and p_proposal->'basis'->'evidenceIds' ? (s->'evidence'->>'id')) then
      raise exception 'Unsupported preserved strength' using errcode='22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_proposal->'basis'->'unknownPrerequisites') loop
    if jsonb_typeof(item)<>'string' or not exists(select 1 from public.skills where id=item#>>'{}') then
      raise exception 'Unknown prerequisite skill' using errcode='22023'; end if;
  end loop;
  item:=p_proposal->'demoConnection';
  if jsonb_typeof(item) is distinct from 'null' then
    if jsonb_typeof(item) is distinct from 'object' or item->>'fixtureId' is distinct from 'demo-frontend-api-v1'
      or item->>'label' is distinct from 'DEMO — NOT A LIVE LISTING'
      or jsonb_typeof(item->'statement') is distinct from 'string' or char_length(item->>'statement') not between 1 and 400
      or p_proposal->>'skillId' not in ('js.functions','js.arrays','js.promises','web.fetch-api') then
      raise exception 'Invalid demo connection' using errcode='22023'; end if;
  end if;
  for evidence_id in select value from jsonb_array_elements(p_proposal->'basis'->'evidenceIds') loop
    if jsonb_typeof(evidence_id)<>'string' or not exists(select 1 from jsonb_array_elements(snapshot->'skills') s
      where s->'evidence'->>'id'=evidence_id#>>'{}' and s->'evidence'->>'kind' in ('quiz','practical_task','externally_verified_project')) then
      raise exception 'Unsupported evidence' using errcode='22023'; end if;
  end loop;
  anchor:=p_proposal->'courseAnchor';
  if jsonb_typeof(anchor) is distinct from 'null' then
    if jsonb_typeof(anchor) is distinct from 'object' or anchor->>'courseId' is distinct from snapshot->'course'->>'id'
      or anchor->'revision' is distinct from snapshot->'course'->'revision'
      or not exists(select 1 from jsonb_array_elements(snapshot->'course'->'modules') m where m->>'id'=anchor->>'moduleId'
        and m->>'title'=anchor->>'moduleTitle' and m->'skillIds' ? (p_proposal->>'skillId')) then
      raise exception 'Invalid course anchor' using errcode='22023'; end if;
  end if;
  if path.id is null then
    insert into public.learning_paths(user_id,goal_id,revision) values(p_user_id,(snapshot->'goal'->>'id')::uuid,1) returning * into path;
  else
    update public.learning_paths set revision=revision+1,updated_at=clock_timestamp() where id=path.id returning * into path;
  end if;
  insert into public.learning_path_revisions(path_id,user_id,revision,selector_version,context_hash,context,proposal)
    values(path.id,p_user_id,path.revision,p_selector_version,p_context_hash,snapshot,p_proposal) returning id into proposal_id;
  receipt:=jsonb_build_object('pathId',path.id,'proposalId',proposal_id,'revision',path.revision);
  insert into public.learning_path_mutations values(p_user_id,p_request_id,p_expected_revision,p_course_id,proposal_id,receipt);
  insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result) values(p_user_id,'path_proposed',p_request_id,proposal_id,
    encode(sha256(convert_to(jsonb_build_object('operation','path_proposed','revision',p_expected_revision,'courseId',p_course_id)::text,'UTF8')),'hex'),receipt);
  return receipt;
end;
$$;
revoke all on function public.propose_learning_path(uuid,integer,text,text,jsonb,uuid,uuid) from public,anon,authenticated;
grant execute on function public.propose_learning_path(uuid,integer,text,text,jsonb,uuid,uuid) to service_role;
