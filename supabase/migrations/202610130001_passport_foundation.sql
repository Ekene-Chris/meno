-- Slice 1: private learner context. Assessment evidence has no learner write path.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 60),
  entry_state text not null check (entry_state in ('starting', 'active', 'returning', 'opportunity_seeking')),
  locale text not null default 'en' check (locale in ('en', 'fr', 'pt', 'ar')),
  study_minutes_per_week integer check (study_minutes_per_week between 15 and 2400),
  device text check (device in ('phone', 'computer', 'shared')),
  bandwidth text check (bandwidth in ('limited', 'reliable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.learning_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  desired_skill text not null check (char_length(btrim(desired_skill)) between 2 and 120),
  target_role text check (char_length(target_role) between 1 and 120),
  motivation text check (char_length(motivation) between 1 and 500),
  status text not null default 'active' check (status in ('active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_active_goal_per_learner on public.learning_goals(user_id) where status = 'active';
create index learning_goals_owner on public.learning_goals(user_id);

create table public.skills (
  id text primary key,
  name text not null,
  description text not null,
  domain text not null default 'frontend',
  position integer not null unique
);
create table public.skill_prerequisites (
  skill_id text not null references public.skills(id),
  prerequisite_skill_id text not null references public.skills(id),
  primary key (skill_id, prerequisite_skill_id),
  check (skill_id <> prerequisite_skill_id)
);

create table public.skill_evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id text not null references public.skills(id),
  kind text not null check (kind in ('self_report', 'quiz', 'practical_task', 'externally_verified_project', 'ai_inference')),
  source_id text not null check (char_length(source_id) between 1 and 200),
  outcome text not null check (outcome in ('observed', 'meets_criteria', 'needs_practice', 'inconclusive')),
  rubric_version text,
  caveat text check (char_length(caveat) <= 1000),
  evaluated_at timestamptz not null default now(),
  unique (id, user_id, skill_id),
  check (kind in ('self_report', 'ai_inference') or nullif(btrim(rubric_version), '') is not null)
);
create index skill_evidence_owner on public.skill_evidence(user_id);

create table public.learner_skills (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id text not null references public.skills(id),
  status text not null default 'not_assessed' check (status in ('not_assessed', 'learning', 'needs_review', 'demonstrated')),
  last_evidence_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id),
  foreign key (last_evidence_id, user_id, skill_id) references public.skill_evidence(id, user_id, skill_id) deferrable initially deferred,
  check (status not in ('demonstrated', 'needs_review') or last_evidence_id is not null)
);

create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('onboarding_completed', 'passport_updated')),
  request_id uuid not null,
  entity_id uuid,
  occurred_at timestamptz not null default now(),
  unique (user_id, request_id)
);

-- A backend bug must not promote self-report or inference to demonstrated ability.
create function public.check_skill_finding() returns trigger
language plpgsql set search_path = '' as $$
declare evidence public.skill_evidence;
begin
  if new.status in ('demonstrated', 'needs_review') then
    select * into evidence from public.skill_evidence
      where id = new.last_evidence_id and user_id = new.user_id and skill_id = new.skill_id;
    if not found or evidence.kind not in ('quiz', 'practical_task', 'externally_verified_project')
       or nullif(btrim(evidence.rubric_version), '') is null
       or (new.status = 'demonstrated' and evidence.outcome <> 'meets_criteria')
       or (new.status = 'needs_review' and evidence.outcome <> 'needs_practice') then
      raise exception 'Skill status requires matching assessed evidence' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger assessed_status_requires_evidence before insert or update on public.learner_skills
for each row execute function public.check_skill_finding();

alter table public.profiles enable row level security;
alter table public.learning_goals enable row level security;
alter table public.skills enable row level security;
alter table public.skill_prerequisites enable row level security;
alter table public.skill_evidence enable row level security;
alter table public.learner_skills enable row level security;
alter table public.learning_events enable row level security;

create policy read_own_profile on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy read_own_goals on public.learning_goals for select to authenticated using ((select auth.uid()) = user_id);
create policy read_own_evidence on public.skill_evidence for select to authenticated using ((select auth.uid()) = user_id);
create policy read_own_skills on public.learner_skills for select to authenticated using ((select auth.uid()) = user_id);
create policy read_own_events on public.learning_events for select to authenticated using ((select auth.uid()) = user_id);
create policy read_skill_catalog on public.skills for select to authenticated using (true);
create policy read_prerequisites on public.skill_prerequisites for select to authenticated using (true);

revoke all on public.profiles, public.learning_goals, public.skills, public.skill_prerequisites,
  public.skill_evidence, public.learner_skills, public.learning_events from anon, authenticated;
grant select on public.profiles, public.learning_goals, public.skills, public.skill_prerequisites,
  public.skill_evidence, public.learner_skills, public.learning_events to authenticated;

-- One bounded atomic mutation. The caller cannot pass or change learner identity.
create function public.save_passport(p_input jsonb, p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  learner_id uuid := auth.uid();
  goal_id uuid;
  is_new boolean;
begin
  if learner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_request_id is null or p_input is null or jsonb_typeof(p_input) <> 'object'
     or octet_length(p_input::text) > 4096 then
    raise exception 'Invalid Passport input' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_input) as field(name)
    where name not in ('display_name', 'entry_state', 'locale', 'study_minutes_per_week', 'device', 'bandwidth', 'desired_skill', 'target_role', 'motivation')) then
    raise exception 'Unknown Passport field' using errcode = '22023';
  end if;

  -- Serialize first saves and edits for this learner, including concurrent retries.
  perform pg_advisory_xact_lock(hashtextextended(learner_id::text, 0));
  if exists (select 1 from public.learning_events where user_id = learner_id and request_id = p_request_id) then
    return;
  end if;
  is_new := not exists (select 1 from public.profiles where id = learner_id);
  insert into public.profiles (id, display_name, entry_state, locale, study_minutes_per_week, device, bandwidth)
  values (learner_id, nullif(btrim(p_input->>'display_name'), ''), p_input->>'entry_state',
    coalesce(p_input->>'locale', 'en'), (p_input->>'study_minutes_per_week')::integer,
    p_input->>'device', p_input->>'bandwidth')
  on conflict (id) do update set display_name = excluded.display_name, entry_state = excluded.entry_state,
    locale = excluded.locale, study_minutes_per_week = excluded.study_minutes_per_week,
    device = excluded.device, bandwidth = excluded.bandwidth, updated_at = now();

  select id into goal_id from public.learning_goals where user_id = learner_id and status = 'active';
  if goal_id is null then
    insert into public.learning_goals(user_id, desired_skill, target_role, motivation)
    values (learner_id, btrim(p_input->>'desired_skill'), nullif(btrim(p_input->>'target_role'), ''), nullif(btrim(p_input->>'motivation'), ''))
    returning id into goal_id;
  else
    update public.learning_goals set desired_skill = btrim(p_input->>'desired_skill'),
      target_role = nullif(btrim(p_input->>'target_role'), ''), motivation = nullif(btrim(p_input->>'motivation'), ''), updated_at = now()
    where id = goal_id;
  end if;

  insert into public.learner_skills(user_id, skill_id)
    select learner_id, id from public.skills on conflict do nothing;
  insert into public.learning_events(user_id, type, request_id, entity_id)
    values (learner_id, case when is_new then 'onboarding_completed' else 'passport_updated' end, p_request_id, goal_id);
end;
$$;
revoke all on function public.save_passport(jsonb, uuid) from public, anon;
grant execute on function public.save_passport(jsonb, uuid) to authenticated;
revoke all on function public.check_skill_finding() from public, anon, authenticated;
