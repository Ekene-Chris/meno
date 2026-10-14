-- Learner decisions never rewrite proposals or skill evidence.
alter table public.learning_path_revisions add column edited_from uuid;
alter table public.learning_path_revisions add constraint edited_path_owner
  foreign key(edited_from,user_id) references public.learning_path_revisions(id,user_id);
create table public.learning_path_decisions (
  proposal_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  decision text not null check(decision in ('accepted','declined')),
  decided_at timestamptz not null default now(),
  foreign key(proposal_id,user_id) references public.learning_path_revisions(id,user_id) on delete cascade
);
create table public.learning_path_actions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  input jsonb not null check(jsonb_typeof(input)='object' and octet_length(input::text)<=8192),
  result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=512),
  proposal_id uuid not null,
  primary key(user_id,request_id),
  foreign key(proposal_id,user_id) references public.learning_path_revisions(id,user_id) on delete cascade
);
alter table public.learning_path_decisions enable row level security;
alter table public.learning_path_actions enable row level security;
create policy read_own_path_decisions on public.learning_path_decisions for select to authenticated using((select auth.uid())=user_id);
create policy read_own_path_actions on public.learning_path_actions for select to authenticated using((select auth.uid())=user_id);
revoke all on public.learning_path_decisions,public.learning_path_actions from public,anon,authenticated;
grant select on public.learning_path_decisions,public.learning_path_actions to authenticated;
grant all on public.learning_path_decisions,public.learning_path_actions to service_role;

alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check check(type in
 ('onboarding_completed','passport_updated','course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated','path_proposed','path_edited','path_accepted','path_declined'));
alter table public.learning_events drop constraint domain_event_receipt;
alter table public.learning_events add constraint domain_event_receipt check (
 (type in ('course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated','path_proposed','path_edited','path_accepted','path_declined')
   and request_hash is not null and result is not null and jsonb_typeof(result)='object' and octet_length(result::text)<=512)
 or (type in ('onboarding_completed','passport_updated') and request_hash is null and result is null)
);

create function public.review_learning_path(p_user_id uuid,p_proposal_id uuid,p_expected_revision integer,p_operation text,p_adjustment jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare original public.learning_path_revisions; path public.learning_paths; prior public.learning_path_actions;
  snapshot jsonb; payload jsonb; receipt jsonb; proposal jsonb; new_id uuid; item jsonb; decision text;
begin
  if p_user_id is null or p_proposal_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<1
    or p_operation is null or p_operation not in ('edit','accept','decline') then
    raise exception 'Invalid request' using errcode='22023'; end if;
  payload:=jsonb_build_object('proposalId',p_proposal_id,'expectedRevision',p_expected_revision,'operation',p_operation,'adjustment',p_adjustment);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  select * into prior from public.learning_path_actions where user_id=p_user_id and request_id=p_request_id;
  if found then
    if prior.input is distinct from payload then raise exception 'Request already used' using errcode='PT409'; end if;
    return prior.result;
  end if;
  if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then
    raise exception 'Request already used' using errcode='PT409'; end if;
  select * into original from public.learning_path_revisions where id=p_proposal_id and user_id=p_user_id;
  if not found then raise exception 'Proposal not found' using errcode='PT404'; end if;
  select * into path from public.learning_paths where id=original.path_id and user_id=p_user_id for update;
  if path.revision<>p_expected_revision or original.revision<>path.revision
    or exists(select 1 from public.learning_path_decisions where proposal_id=original.id) then
    raise exception 'Proposal changed or already decided' using errcode='PT409'; end if;
  -- Declining an obsolete proposal is safe: it cannot activate or edit anything.
  -- Accept/edit must match the current active goal and the entire bounded context.
  if p_operation<>'decline' then
    begin
      snapshot:=public.learning_path_context_for(p_user_id,(original.context->'course'->>'id')::uuid);
    exception when sqlstate 'PT404' then raise exception 'Course changed' using errcode='PT409'; end;
    if path.goal_id is distinct from (snapshot->'goal'->>'id')::uuid or original.context_hash is distinct from encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') then
      raise exception 'Learning context changed' using errcode='PT409'; end if;
  end if;
  if p_operation='edit' then
    if p_adjustment is null or jsonb_typeof(p_adjustment)<>'object'
      or not(p_adjustment ?& array['title','steps','estimatedMinutes']) or (select count(*) from jsonb_object_keys(p_adjustment))<>3
      or jsonb_typeof(p_adjustment->'title') is distinct from 'string' or char_length(p_adjustment->>'title') not between 1 and 160 or p_adjustment->>'title' is distinct from btrim(p_adjustment->>'title')
      or jsonb_typeof(p_adjustment->'estimatedMinutes') is distinct from 'number' or (p_adjustment->>'estimatedMinutes')::numeric not in (5,15,25)
      or jsonb_typeof(p_adjustment->'steps') is distinct from 'array' or jsonb_array_length(p_adjustment->'steps') not between 2 and 4 then
      raise exception 'Invalid adjustment' using errcode='22023'; end if;
    for item in select value from jsonb_array_elements(p_adjustment->'steps') loop
      if jsonb_typeof(item)<>'string' or char_length(item#>>'{}') not between 1 and 400 or item#>>'{}' is distinct from btrim(item#>>'{}') then
        raise exception 'Invalid step' using errcode='22023'; end if;
    end loop;
    if snapshot->'learner'->>'studyMinutesPerWeek' is not null and (p_adjustment->>'estimatedMinutes')::integer>(snapshot->'learner'->>'studyMinutesPerWeek')::integer then
      raise exception 'Step exceeds saved weekly time' using errcode='22023'; end if;
    proposal:=original.proposal||p_adjustment;
    update public.learning_paths set revision=revision+1,updated_at=clock_timestamp() where id=path.id returning * into path;
    insert into public.learning_path_revisions(path_id,user_id,revision,selector_version,context_hash,context,proposal,edited_from)
      values(path.id,p_user_id,path.revision,original.selector_version,original.context_hash,original.context,proposal,original.id) returning id into new_id;
    receipt:=jsonb_build_object('pathId',path.id,'proposalId',new_id,'revision',path.revision);
  else
    if p_adjustment is not null then raise exception 'Unexpected adjustment' using errcode='22023'; end if;
    decision:=case when p_operation='accept' then 'accepted' else 'declined' end;
    insert into public.learning_path_decisions(proposal_id,user_id,decision) values(original.id,p_user_id,decision);
    if p_operation='accept' then
      update public.learning_paths set active_revision=original.revision,updated_at=clock_timestamp() where id=path.id;
    end if;
    new_id:=original.id;
    receipt:=jsonb_build_object('pathId',path.id,'proposalId',new_id,'revision',path.revision,'decision',decision);
  end if;
  insert into public.learning_path_actions(user_id,request_id,input,result,proposal_id) values(p_user_id,p_request_id,payload,receipt,new_id);
  insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result) values(p_user_id,
    case p_operation when 'edit' then 'path_edited' when 'accept' then 'path_accepted' else 'path_declined' end,p_request_id,new_id,
    encode(sha256(convert_to(payload::text,'UTF8')),'hex'),receipt);
  return receipt;
end;
$$;
revoke all on function public.review_learning_path(uuid,uuid,integer,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.review_learning_path(uuid,uuid,integer,text,jsonb,uuid) to service_role;

-- A stable read uses one database snapshot for root, active step, history and freshness.
create function public.get_learning_path_review(p_course_id uuid default null,p_use_saved_course boolean default true,p_before_revision integer default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare learner uuid:=auth.uid(); path public.learning_paths; latest jsonb; active jsonb; history jsonb;
  snapshot jsonb; course uuid:=p_course_id; available boolean:=true;
begin
  if learner is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select lp.* into path from public.learning_paths lp join public.learning_goals g on g.id=lp.goal_id and g.status='active' where lp.user_id=learner;
  select to_jsonb(r)||jsonb_build_object('decision',d.decision) into latest from public.learning_path_revisions r
    left join public.learning_path_decisions d on d.proposal_id=r.id where r.path_id=path.id and r.revision=path.revision and r.user_id=learner;
  if p_use_saved_course then course:=(latest->'context'->'course'->>'id')::uuid; end if;
  begin
    snapshot:=public.learning_path_context_for(learner,course);
  exception when sqlstate 'PT404' or sqlstate 'PT409' then
    if not p_use_saved_course then raise; end if;
    available:=false;
  end;
  select to_jsonb(r)||jsonb_build_object('decision',d.decision) into active from public.learning_path_revisions r
    left join public.learning_path_decisions d on d.proposal_id=r.id where r.path_id=path.id and r.revision=path.active_revision and r.user_id=learner;
  select coalesce(jsonb_agg(row order by rev desc),'[]') into history from (
    select to_jsonb(r)||jsonb_build_object('decision',d.decision) row,r.revision rev from public.learning_path_revisions r
    left join public.learning_path_decisions d on d.proposal_id=r.id
    where r.path_id=path.id and r.user_id=learner and (p_before_revision is null or r.revision<p_before_revision)
    order by r.revision desc limit 20
  ) revisions;
  return jsonb_build_object('pathId',path.id,'revision',coalesce(path.revision,0),'activeRevision',path.active_revision,
    'latest',latest,'active',active,'history',history,'courseId',course,'contextAvailable',available,
    'contextHash',case when snapshot is null then null else encode(sha256(convert_to(snapshot::text,'UTF8')),'hex') end);
end;
$$;
revoke all on function public.get_learning_path_review(uuid,boolean,integer) from public,anon;
grant execute on function public.get_learning_path_review(uuid,boolean,integer) to authenticated;
