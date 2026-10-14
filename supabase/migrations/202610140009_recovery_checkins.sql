-- Explicit learner reports and deliberately selected demo pauses. No inactivity inference.
create table public.recovery_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=1024),
  source text not null check(source in ('user_report','demo_pause')),
  obstacle text not null check(obstacle in ('time','confused','access','returning')),
  accepted_proposal_id uuid not null,
  proposal_id uuid not null unique,
  result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=512),
  created_at timestamptz not null default clock_timestamp(),
  unique(user_id,request_id),
  check(source<>'demo_pause' or obstacle='returning'),
  foreign key(accepted_proposal_id,user_id) references public.learning_path_revisions(id,user_id) on delete cascade,
  foreign key(proposal_id,user_id) references public.learning_path_revisions(id,user_id) on delete cascade
);
alter table public.recovery_checkins enable row level security;
create policy read_own_recovery_checkins on public.recovery_checkins for select to authenticated using((select auth.uid())=user_id);
revoke all on public.recovery_checkins from public,anon,authenticated;
grant select on public.recovery_checkins to authenticated;
grant all on public.recovery_checkins to service_role;

-- Both the evidence-based suggestion and the learner-requested reduction commit together.
-- Existing proposal/review contracts enforce ownership, context freshness, references and time bounds.
create function public.propose_checkin_recovery(p_user_id uuid,p_request_id uuid,p_expected_revision integer,
  p_accepted_proposal_id uuid,p_source text,p_obstacle text,p_context_hash text,p_proposal jsonb,p_adjustment jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.recovery_checkins; accepted public.learning_path_revisions;
  path public.learning_paths; payload jsonb; base jsonb; receipt jsonb;
begin
  if p_user_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<1 or p_expected_revision>2147483644
    or p_accepted_proposal_id is null or p_source is null or p_source not in ('user_report','demo_pause')
    or p_obstacle is null or p_obstacle not in ('time','confused','access','returning')
    or (p_source='demo_pause' and p_obstacle<>'returning') then
    raise exception 'Invalid check-in' using errcode='22023'; end if;
  payload:=jsonb_build_object('expectedRevision',p_expected_revision,'acceptedProposalId',p_accepted_proposal_id,'source',p_source,'obstacle',p_obstacle);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into prior from public.recovery_checkins where user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.input is distinct from payload then raise exception 'Request reused' using errcode='PT409'; end if;
    return prior.result;
  end if;
  if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then
    raise exception 'Request reused' using errcode='PT409'; end if;
  select * into accepted from public.learning_path_revisions where id=p_accepted_proposal_id and user_id=p_user_id;
  if not found then raise exception 'Accepted step not found' using errcode='PT404'; end if;
  select lp.* into path from public.learning_paths lp join public.learning_goals g on g.id=lp.goal_id and g.status='active'
    where lp.id=accepted.path_id and lp.user_id=p_user_id for update of lp;
  if path.id is null or path.revision<>p_expected_revision or path.active_revision is distinct from accepted.revision then
    raise exception 'Accepted step changed' using errcode='PT409'; end if;
  if not exists(select 1 from public.learning_path_revisions r join public.learning_path_decisions d on d.proposal_id=r.id
    where r.path_id=path.id and r.revision=path.revision and r.user_id=p_user_id) then
    raise exception 'Review the pending proposal first' using errcode='PT409'; end if;
  if p_adjustment->'estimatedMinutes' is distinct from '5'::jsonb then
    raise exception 'Recovery activity must be five minutes' using errcode='22023'; end if;
  base:=public.propose_learning_path(p_user_id,p_expected_revision,p_context_hash,'recovery-v1',p_proposal,gen_random_uuid(),(accepted.context->'course'->>'id')::uuid);
  receipt:=public.review_learning_path(p_user_id,(base->>'proposalId')::uuid,(base->>'revision')::integer,'edit',p_adjustment,p_request_id);
  insert into public.recovery_checkins(user_id,request_id,input,source,obstacle,accepted_proposal_id,proposal_id,result)
    values(p_user_id,p_request_id,payload,p_source,p_obstacle,p_accepted_proposal_id,(receipt->>'proposalId')::uuid,receipt);
  return receipt;
end;
$$;
revoke all on function public.propose_checkin_recovery(uuid,uuid,integer,uuid,text,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.propose_checkin_recovery(uuid,uuid,integer,uuid,text,text,text,jsonb,jsonb) to service_role;

-- Resolve provenance for edited descendants too, so a demo label survives later learner edits.
create function public.get_checkin_provenance(p_proposal_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare learner uuid:=auth.uid(); result jsonb;
begin
  if learner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if coalesce(cardinality(p_proposal_ids),0)>22 then raise exception 'Too many proposals' using errcode='22023'; end if;
  with recursive ancestors as (
    select r.id original,r.id,r.edited_from,r.revision,r.path_id from public.learning_path_revisions r
      where r.id=any(p_proposal_ids) and r.user_id=learner
    union all
    select a.original,r.id,r.edited_from,r.revision,r.path_id from ancestors a
      join public.learning_path_revisions r on r.id=a.edited_from and r.user_id=learner and r.path_id=a.path_id and r.revision<a.revision
  )
  select coalesce(jsonb_object_agg(a.original::text,jsonb_build_object('id',c.id,'source',c.source,'obstacle',c.obstacle,'createdAt',c.created_at)),'{}') into result
    from ancestors a join public.recovery_checkins c on c.proposal_id=a.id and c.user_id=learner;
  return result;
end;
$$;
revoke all on function public.get_checkin_provenance(uuid[]) from public,anon;
grant execute on function public.get_checkin_provenance(uuid[]) to authenticated;
