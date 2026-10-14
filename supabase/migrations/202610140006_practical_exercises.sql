-- T1: a fixed, versioned practical scaffold; no code execution or skill evidence writes.
create table public.practical_catalog (
 id text primary key, rubric_version text not null, content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
 public_content jsonb not null check(jsonb_typeof(public_content)='object' and octet_length(public_content::text)<=32768)
);
alter table public.practical_catalog enable row level security;
create policy read_practical_catalog on public.practical_catalog for select to authenticated using(true);
revoke all on public.practical_catalog from public,anon,authenticated;
grant select on public.practical_catalog to authenticated,service_role;
insert into public.practical_catalog(id,rubric_version,content_hash,public_content) values ('api-mini-app-v1','guided-api-rubric-v1','55969b48184f293a06e4b77705bd528ea52c0abe294183231918f3a6c1bb0d63', '{"id":"api-mini-app-v1","rubricVersion":"guided-api-rubric-v1","title":"A small API app, one decision at a time","description":"Build three fixed JavaScript scaffolds using code choices, then trace their behavior. Save between sessions. This is guided practice, not an independently built or executed app.","sessions":[{"id":"promises","title":"1. Reconnect with promises","intro":"A local fixture replaces a network call. Assemble the chain, then trace a fulfilled promise. Nothing is executed here.","template":"console.log(\"start\");\nconst pending = Promise.resolve({ name: \"Amina\" });\npending\n  /* choose the callback */\n  /* choose the next step */\n  /* choose rejection handling */\nconsole.log(\"ready\");","slots":[{"id":"promise-return","label":"Return the name from the first callback","skillId":"js.promises","scope":"Returns a value through this fixed promise chain","options":[{"id":"return-name","text":".then(person => person.name)"},{"id":"log-name","text":".then(person => { console.log(person.name); })"},{"id":"read-pending","text":".then(() => pending.name)"}]},{"id":"promise-next","label":"Display the value in the next callback","skillId":"js.promises","scope":"Uses the resolved value in a chained callback","options":[{"id":"log-value","text":".then(name => console.log(name))"},{"id":"log-promise","text":".then(() => console.log(pending))"},{"id":"return-console","text":".then(console.log(\"Amina\"))"}]},{"id":"promise-reject","label":"Handle a rejected operation","skillId":"js.promises","scope":"Attaches a rejection handler to this fixed chain","options":[{"id":"catch-error","text":".catch(() => console.log(\"unavailable\"));"},{"id":"then-error","text":".then(() => console.log(\"unavailable\"));"},{"id":"no-handler","text":"; // no rejection handler"}]},{"id":"promise-trace","label":"For the intended chain, what is the console order?","skillId":"js.promises","scope":"Predicts synchronous and promise callback order in this fixture","options":[{"id":"start-ready-amina","text":"start → ready → Amina"},{"id":"start-amina-ready","text":"start → Amina → ready"},{"id":"amina-start-ready","text":"Amina → start → ready"}]}]},{"id":"fetch","title":"2. Fetch and read a response","intro":"Use a fictional /people endpoint with fixed response cases. Choose each line for loadPerson, then check an HTTP error branch. No endpoint is fetched.","template":"async function loadPerson() {\n  const response = await fetch(\"/people\");\n  /* choose status handling */\n  /* choose body parsing */\n  /* choose the returned value */\n}","slots":[{"id":"fetch-status","label":"Handle an unsuccessful HTTP status","skillId":"web.fetch-api","scope":"Checks HTTP failure in a fixed fetch scaffold","options":[{"id":"check-ok","text":"if (!response.ok) throw new Error(\"unavailable\");"},{"id":"skip-status","text":"// every response is treated as successful"},{"id":"check-response","text":"if (!response) throw new Error(\"unavailable\");"}]},{"id":"fetch-json","label":"Read a JSON response body","skillId":"web.fetch-api","scope":"Awaits JSON parsing in this fixed scaffold","options":[{"id":"await-json","text":"const person = await response.json();"},{"id":"unawaited-json","text":"const person = response.json();"},{"id":"read-property","text":"const person = response.name;"}]},{"id":"fetch-return","label":"Return the parsed name","skillId":"web.fetch-api","scope":"Returns a parsed field from this fixed async function","options":[{"id":"return-parsed","text":"return person.name;"},{"id":"return-raw","text":"return response.name;"},{"id":"return-nothing","text":"return;"}]},{"id":"fetch-trace","label":"With the intended function and HTTP 404, what happens?","skillId":"web.fetch-api","scope":"Distinguishes HTTP-error handling from successful JSON parsing","options":[{"id":"throws-before-json","text":"Throws unavailable before reading JSON"},{"id":"returns-name","text":"Returns the name"},{"id":"fetch-rejects-status","text":"fetch itself always rejects for 404"}]}]},{"id":"display","title":"3. Display and review the result","intro":"Assume loadPerson from session 2 returns the name or rejects. output is a text container. Complete the display logic, then trace failure.","template":"async function showPerson(output) {\n  /* choose initial feedback */\n  try {\n    const name = await loadPerson();\n    /* choose safe display */\n  } catch {\n    /* choose failure feedback */\n  }\n}","slots":[{"id":"display-loading","label":"Tell the learner the request is pending","skillId":"web.dom","scope":"Provides a pending state in this fixed DOM scaffold","options":[{"id":"loading-text","text":"output.textContent = \"Loading…\";"},{"id":"loading-empty","text":"output.textContent = \"\";"},{"id":"loading-success","text":"output.textContent = \"Loaded\";"}]},{"id":"display-text","label":"Display an untrusted name as text","skillId":"web.dom","scope":"Chooses textContent for an untrusted field in this fixture","options":[{"id":"text-content","text":"output.textContent = name;"},{"id":"inner-html","text":"output.innerHTML = name;"},{"id":"document-write","text":"document.write(name);"}]},{"id":"display-error","label":"Keep failure visible","skillId":"web.dom","scope":"Provides an error state in this fixed DOM scaffold","options":[{"id":"error-text","text":"output.textContent = \"Could not load. Try again.\";"},{"id":"hide-error","text":"output.textContent = \"\";"},{"id":"false-success","text":"output.textContent = \"Loaded\";"}]},{"id":"display-trace","label":"With the intended display and a rejected load, what remains?","skillId":"web.dom","scope":"Predicts the rendered failure state in this fixture","options":[{"id":"visible-error","text":"Could not load. Try again."},{"id":"still-loading","text":"Loading…"},{"id":"visible-name","text":"Amina"}]}]}],"limitations":["Only fixed scaffold choices and trace predictions are checked.","Submitted code and reflection are inert text; their quality, authorship and runtime behavior are not assessed.","No live API, deployed app, comprehensive skill mastery or career qualification is verified.","T1 feedback does not change your Passport evidence, accepted step or course checkpoint."]}'::jsonb);
create table public.practical_attempts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 goal_id uuid not null, accepted_proposal_id uuid,
 catalog_id text not null references public.practical_catalog(id), rubric_version text not null,
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'), public_content jsonb not null,
 input jsonb not null default '{"mode":"guided","choices":{},"code":"","reflection":""}' check(jsonb_typeof(input)='object' and octet_length(input::text)<=65536),
 revision integer not null default 1 check(revision>0), status text not null default 'draft' check(status in ('draft','submitted')),
 feedback jsonb check(feedback is null or (jsonb_typeof(feedback)='object' and octet_length(feedback::text)<=32768)),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), submitted_at timestamptz,
 unique(id,user_id), foreign key(goal_id,user_id) references public.learning_goals(id,user_id) on delete cascade,
 foreign key(accepted_proposal_id,user_id) references public.learning_path_revisions(id,user_id) on delete set null (accepted_proposal_id),
 check((status='draft' and feedback is null and submitted_at is null) or (status='submitted' and feedback is not null and submitted_at is not null))
);
create unique index one_practical_draft on public.practical_attempts(user_id,catalog_id) where status='draft';
create index practical_history on public.practical_attempts(user_id,created_at desc,id);
create table public.practical_mutations (
 user_id uuid not null references public.profiles(id) on delete cascade, request_id uuid not null, attempt_id uuid not null,
 request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'), result jsonb not null check(jsonb_typeof(result)='object' and octet_length(result::text)<=512),
 primary key(user_id,request_id), foreign key(attempt_id,user_id) references public.practical_attempts(id,user_id) on delete cascade
);
alter table public.practical_attempts enable row level security;
alter table public.practical_mutations enable row level security;
create policy read_own_practical on public.practical_attempts for select to authenticated using((select auth.uid())=user_id);
create policy read_own_practical_receipt on public.practical_mutations for select to authenticated using((select auth.uid())=user_id);
revoke all on public.practical_attempts,public.practical_mutations from public,anon,authenticated;
grant select on public.practical_attempts,public.practical_mutations to authenticated;
grant select,insert,update,delete on public.practical_attempts,public.practical_mutations to service_role;
alter table public.learning_events drop constraint learning_events_type_check;
alter table public.learning_events add constraint learning_events_type_check check(type in ('onboarding_completed','passport_updated','course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated','path_proposed','path_edited','path_accepted','path_declined','practical_started','practical_submitted'));
alter table public.learning_events drop constraint domain_event_receipt;
alter table public.learning_events add constraint domain_event_receipt check (
 (type in ('course_draft_saved','course_confirmed','diagnostic_started','diagnostic_evaluated','path_proposed','path_edited','path_accepted','path_declined','practical_started','practical_submitted') and request_hash is not null and result is not null and jsonb_typeof(result)='object' and octet_length(result::text)<=512)
 or (type in ('onboarding_completed','passport_updated') and request_hash is null and result is null)
);
create function public.start_practical_attempt(p_user_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.practical_mutations; attempt public.practical_attempts; catalog public.practical_catalog; goal uuid; accepted uuid; fingerprint text; receipt jsonb; created boolean:=false;
begin
 if p_user_id is null or p_request_id is null then raise exception 'Invalid start' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to('{"operation":"start-api-mini-app-v1"}','UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into prior from public.practical_mutations where user_id=p_user_id and request_id=p_request_id;
 if found then if prior.request_hash<>fingerprint then raise exception 'Request reused' using errcode='PT409'; end if; return prior.result; end if;
 if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request reused' using errcode='PT409'; end if;
 select id into goal from public.learning_goals where user_id=p_user_id and status='active';
 if not found then raise exception 'Passport required' using errcode='PT409'; end if;
 select * into attempt from public.practical_attempts where user_id=p_user_id and catalog_id='api-mini-app-v1' and status='draft';
 if not found then
  select * into catalog from public.practical_catalog where id='api-mini-app-v1';
  if not found then raise exception 'Exercise unavailable' using errcode='PT409'; end if;
  select proposal.id into accepted from public.learning_paths path join public.learning_path_revisions proposal on proposal.path_id=path.id and proposal.revision=path.active_revision where path.user_id=p_user_id and path.goal_id=goal;
  insert into public.practical_attempts(user_id,goal_id,accepted_proposal_id,catalog_id,rubric_version,content_hash,public_content) values(p_user_id,goal,accepted,catalog.id,catalog.rubric_version,catalog.content_hash,catalog.public_content) returning * into attempt;
  created:=true;
 end if;
 receipt:=jsonb_build_object('attemptId',attempt.id,'revision',attempt.revision,'status',attempt.status);
 insert into public.practical_mutations values(p_user_id,p_request_id,attempt.id,fingerprint,receipt);
 if created then insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result) values(p_user_id,'practical_started',p_request_id,attempt.id,fingerprint,receipt); end if;
 return receipt;
end;
$$;
create function public.mutate_practical_attempt(p_user_id uuid,p_attempt_id uuid,p_request_id uuid,p_expected_revision integer,p_operation text,p_input jsonb,p_feedback jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare prior public.practical_mutations; attempt public.practical_attempts; fingerprint text; receipt jsonb; pair record; slot jsonb; criterion jsonb; seen text[]:='{}';
begin
 if p_user_id is null or p_attempt_id is null or p_request_id is null or p_expected_revision is null or p_expected_revision<1 or p_expected_revision>=2147483647 or p_operation is null or p_operation not in ('save','submit')
  or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>65536 or not(p_input ?& array['mode','choices','code','reflection']) or (select count(*) from jsonb_object_keys(p_input))<>4
  or p_input->>'mode' not in ('guided','open') or jsonb_typeof(p_input->'mode') is distinct from 'string'
  or jsonb_typeof(p_input->'choices') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_input->'choices'))>12
  or jsonb_typeof(p_input->'code') is distinct from 'string' or char_length(p_input->>'code')>12000
  or jsonb_typeof(p_input->'reflection') is distinct from 'string' or char_length(p_input->>'reflection')>2000
  or (p_input->>'mode'='open' and p_input->'choices'<>'{}'::jsonb) then raise exception 'Invalid work' using errcode='22023'; end if;
 fingerprint:=encode(sha256(convert_to(jsonb_build_object('operation',p_operation,'attempt',p_attempt_id,'revision',p_expected_revision,'input',p_input)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
 select * into prior from public.practical_mutations where user_id=p_user_id and request_id=p_request_id;
 if found then if prior.request_hash<>fingerprint then raise exception 'Request reused' using errcode='PT409'; end if; return prior.result; end if;
 if exists(select 1 from public.learning_events where user_id=p_user_id and request_id=p_request_id) then raise exception 'Request reused' using errcode='PT409'; end if;
 select * into attempt from public.practical_attempts where id=p_attempt_id and user_id=p_user_id for update;
 if not found then raise exception 'Attempt not found' using errcode='PT404'; end if;
 if attempt.status<>'draft' or attempt.revision<>p_expected_revision then raise exception 'Work changed' using errcode='PT409'; end if;
 for pair in select * from jsonb_each(p_input->'choices') loop
  select s into slot from jsonb_array_elements(attempt.public_content->'sessions') session cross join lateral jsonb_array_elements(session->'slots') s where s->>'id'=pair.key;
  if not found or jsonb_typeof(pair.value)<>'string' or not exists(select 1 from jsonb_array_elements(slot->'options') o where o->>'id'=pair.value#>>'{}') then raise exception 'Unknown choice' using errcode='22023'; end if;
 end loop;
 if p_operation='save' and p_feedback is not null then raise exception 'Draft cannot have feedback' using errcode='22023'; end if;
 if p_operation='submit' then
  if p_feedback is null or jsonb_typeof(p_feedback)<>'object' or octet_length(p_feedback::text)>32768 or not(p_feedback ?& array['rubricVersion','outcome','criteria','limitations']) or (select count(*) from jsonb_object_keys(p_feedback))<>4
   or p_feedback->>'rubricVersion' is distinct from attempt.rubric_version or p_feedback->>'outcome' is null or p_feedback->>'outcome' not in ('meets_guided_rubric','needs_review','inconclusive')
   or jsonb_typeof(p_feedback->'criteria') is distinct from 'array' or jsonb_array_length(p_feedback->'criteria')<>12
   or p_feedback->'limitations' is distinct from attempt.public_content->'limitations' then raise exception 'Invalid feedback' using errcode='22023'; end if;
  for criterion in select value from jsonb_array_elements(p_feedback->'criteria') loop
   select s into slot from jsonb_array_elements(attempt.public_content->'sessions') session cross join lateral jsonb_array_elements(session->'slots') s where s->>'id'=criterion->>'id';
   if not found or criterion->>'id'=any(seen) or jsonb_typeof(criterion)<>'object' or not(criterion ?& array['id','skillId','scope','status','observedChoiceId','feedback']) or (select count(*) from jsonb_object_keys(criterion))<>6
    or criterion->>'skillId' is distinct from slot->>'skillId' or criterion->>'scope' is distinct from slot->>'scope'
    or criterion->>'status' is null or criterion->>'status' not in ('met','needs_review','inconclusive')
    or jsonb_typeof(criterion->'feedback') is distinct from 'string' or char_length(criterion->>'feedback') not between 1 and 600
    or criterion->>'observedChoiceId' is distinct from p_input->'choices'->>(criterion->>'id')
    or ((criterion->>'observedChoiceId' is null) is distinct from (criterion->>'status'='inconclusive')) then raise exception 'Invalid criterion' using errcode='22023'; end if;
   seen:=array_append(seen,criterion->>'id');
  end loop;
  if p_feedback->>'outcome' is distinct from (case when exists(select 1 from jsonb_array_elements(p_feedback->'criteria') c where c->>'status'='inconclusive') then 'inconclusive' when exists(select 1 from jsonb_array_elements(p_feedback->'criteria') c where c->>'status'='needs_review') then 'needs_review' else 'meets_guided_rubric' end) then raise exception 'Invalid outcome' using errcode='22023'; end if;
 end if;
 update public.practical_attempts set input=p_input,revision=revision+1,status=case when p_operation='submit' then 'submitted' else 'draft' end,feedback=p_feedback,updated_at=now(),submitted_at=case when p_operation='submit' then now() else null end where id=p_attempt_id returning * into attempt;
 receipt:=jsonb_build_object('attemptId',attempt.id,'revision',attempt.revision,'status',attempt.status);
 insert into public.practical_mutations values(p_user_id,p_request_id,attempt.id,fingerprint,receipt);
 if p_operation='submit' then insert into public.learning_events(user_id,type,request_id,entity_id,request_hash,result) values(p_user_id,'practical_submitted',p_request_id,attempt.id,fingerprint,receipt); end if;
 return receipt;
end;
$$;
revoke all on function public.start_practical_attempt(uuid,uuid), public.mutate_practical_attempt(uuid,uuid,uuid,integer,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.start_practical_attempt(uuid,uuid), public.mutate_practical_attempt(uuid,uuid,uuid,integer,text,jsonb,jsonb) to service_role;
