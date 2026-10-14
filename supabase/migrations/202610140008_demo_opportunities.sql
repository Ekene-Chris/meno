-- O1/O2 tonight: only visibly fictional opportunities; no fabricated source/application links.
create table public.opportunities(id text primary key check(id ~ '^demo-[a-z0-9-]{1,75}$'),content jsonb not null check(jsonb_typeof(content)='object' and content ?& array['id','verification','isDemo','sourceUrl','applicationUrl'] and jsonb_typeof(content->'id')='string' and jsonb_typeof(content->'verification')='string' and content->>'id'=id and content->>'verification'='demo' and content->'isDemo'='true'::jsonb and content->'sourceUrl'='null'::jsonb and content->'applicationUrl'='null'::jsonb and octet_length(content::text)<=8192));
create table public.opportunity_requirements(opportunity_id text not null references public.opportunities(id),id text not null,skill_id text not null references public.skills(id),content jsonb not null check(jsonb_typeof(content)='object' and content ?& array['id','skillId','priority','evidenceLevel'] and jsonb_typeof(content->'id')='string' and jsonb_typeof(content->'skillId')='string' and jsonb_typeof(content->'priority')='string' and jsonb_typeof(content->'evidenceLevel')='string' and content->>'id'=id and content->>'skillId'=skill_id and content->>'priority' in ('required','preferred') and content->>'evidenceLevel' in ('guided_foundation','independent_project')),primary key(opportunity_id,id));
alter table public.opportunities enable row level security;
alter table public.opportunity_requirements enable row level security;
create policy read_opportunity_examples on public.opportunities for select to authenticated using(true);
create policy read_opportunity_requirement_examples on public.opportunity_requirements for select to authenticated using(true);
revoke all on public.opportunities,public.opportunity_requirements from public,anon,authenticated;
grant select on public.opportunities,public.opportunity_requirements to authenticated,service_role;
insert into public.opportunities(id,content) values ('demo-frontend-api-v1','{"id":"demo-frontend-api-v1","title":"Frontend API portfolio brief","kind":"portfolio","description":"An example direction: prepare a small interface that reads data, handles failure and explains its decisions. This is a fictional project brief, not a vacancy.","organization":"Meno fictional scenario","verification":"demo","isDemo":true,"sourceUrl":null,"applicationUrl":null,"deadline":null,"location":null,"eligibility":["Location and work authorization rules are unspecified.","Education, time commitment and compensation are unspecified.","This fictional example has no application process."]}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-api-v1','promise-preparation','js.promises','{"id":"promise-preparation","skillId":"js.promises","priority":"required","evidenceLevel":"guided_foundation","title":"Promise-chain preparation","description":"Meet the fixed promise scaffold and trace criteria; independent promise implementation is assessed separately."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-api-v1','fetch-preparation','web.fetch-api','{"id":"fetch-preparation","skillId":"web.fetch-api","priority":"required","evidenceLevel":"guided_foundation","title":"API-response preparation","description":"Meet the fixed status-check, JSON-reading and response trace criteria. This is preparation, not a deployed integration."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-api-v1','functions-project','js.functions','{"id":"functions-project","skillId":"js.functions","priority":"required","evidenceLevel":"independent_project","title":"Apply functions in your own project","description":"Provide independently assessed project evidence for this skill."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-api-v1','arrays-project','js.arrays','{"id":"arrays-project","skillId":"js.arrays","priority":"required","evidenceLevel":"independent_project","title":"Apply array transformations","description":"Provide independently assessed project evidence for this skill."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-api-v1','promises-project','js.promises','{"id":"promises-project","skillId":"js.promises","priority":"required","evidenceLevel":"independent_project","title":"Build an independent promise flow","description":"Guided choices and quiz answers do not establish independent implementation."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-api-v1','fetch-project','web.fetch-api','{"id":"fetch-project","skillId":"web.fetch-api","priority":"required","evidenceLevel":"independent_project","title":"Build and review an API integration","description":"Independent project evidence is still needed after guided preparation."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-api-v1','git-project','git.basics','{"id":"git-project","skillId":"git.basics","priority":"preferred","evidenceLevel":"independent_project","title":"Share a versioned project","description":"A published, reviewed source history can support this preferred requirement; it is not verified by this prototype exercise."}'::jsonb);
insert into public.opportunities(id,content) values ('demo-frontend-apprenticeship-v1','{"id":"demo-frontend-apprenticeship-v1","title":"Junior frontend apprenticeship pathway","kind":"apprenticeship","description":"Explore the kinds of learning evidence a frontend apprenticeship might ask for. No employer, place, compensation or application is real.","organization":"Meno fictional scenario","verification":"demo","isDemo":true,"sourceUrl":null,"applicationUrl":null,"deadline":null,"location":null,"eligibility":["Location and work authorization rules are unspecified.","Education, time commitment and compensation are unspecified.","This fictional example has no application process."]}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-apprenticeship-v1','html-project','web.html-basics','{"id":"html-project","skillId":"web.html-basics","priority":"required","evidenceLevel":"independent_project","title":"Build a meaningful page structure","description":"An independent HTML artifact should support this requirement."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-apprenticeship-v1','css-project','web.css-layout','{"id":"css-project","skillId":"web.css-layout","priority":"required","evidenceLevel":"independent_project","title":"Explain and implement a responsive layout","description":"A CSS layout artifact remains unverified by the JavaScript exercises."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-apprenticeship-v1','dom-preparation','web.dom','{"id":"dom-preparation","skillId":"web.dom","priority":"required","evidenceLevel":"guided_foundation","title":"Prepare loading, text and error states","description":"The fixed display scaffold can support this preparation requirement, within its limited scope."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-frontend-apprenticeship-v1','git-project','git.basics','{"id":"git-project","skillId":"git.basics","priority":"preferred","evidenceLevel":"independent_project","title":"Work with version control","description":"Version-control evidence stays separate from JavaScript progress."}'::jsonb);
insert into public.opportunities(id,content) values ('demo-community-ui-v1','{"id":"demo-community-ui-v1","title":"Community interface challenge","kind":"community","description":"A fictional community contribution brief for practicing a small accessible interface. Use it to choose evidence to build, not to claim an open contribution task.","organization":"Meno fictional scenario","verification":"demo","isDemo":true,"sourceUrl":null,"applicationUrl":null,"deadline":null,"location":null,"eligibility":["Location and work authorization rules are unspecified.","Education, time commitment and compensation are unspecified.","This fictional example has no application process."]}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-community-ui-v1','dom-preparation','web.dom','{"id":"dom-preparation","skillId":"web.dom","priority":"required","evidenceLevel":"guided_foundation","title":"Practice visible interface states","description":"Meet the fixed display choices and failure trace; accessibility and a complete app are not thereby verified."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-community-ui-v1','html-project','web.html-basics','{"id":"html-project","skillId":"web.html-basics","priority":"required","evidenceLevel":"independent_project","title":"Create semantic page content","description":"Independent HTML work remains needed."}'::jsonb);
insert into public.opportunity_requirements(opportunity_id,id,skill_id,content) values ('demo-community-ui-v1','css-project','web.css-layout','{"id":"css-project","skillId":"web.css-layout","priority":"preferred","evidenceLevel":"independent_project","title":"Adapt the layout to small screens","description":"This preferred artifact requirement is independent of guided DOM progress."}'::jsonb);
create table public.saved_opportunities(user_id uuid not null references public.profiles(id) on delete cascade,opportunity_id text not null references public.opportunities(id),baseline jsonb not null check(jsonb_typeof(baseline)='array' and jsonb_array_length(baseline)<=12 and octet_length(baseline::text)<=16384),saved_at timestamptz not null default clock_timestamp(),primary key(user_id,opportunity_id));
create table public.opportunity_save_receipts(user_id uuid not null references public.profiles(id) on delete cascade,request_id uuid not null,opportunity_id text not null references public.opportunities(id),expected_saved boolean not null,saved boolean not null,result jsonb not null,primary key(user_id,request_id));
alter table public.saved_opportunities enable row level security;
alter table public.opportunity_save_receipts enable row level security;
create policy read_own_saved_opportunities on public.saved_opportunities for select to authenticated using((select auth.uid())=user_id);
create policy read_own_opportunity_receipts on public.opportunity_save_receipts for select to authenticated using((select auth.uid())=user_id);
revoke all on public.saved_opportunities,public.opportunity_save_receipts from public,anon,authenticated;
grant select on public.saved_opportunities,public.opportunity_save_receipts to authenticated;
create function public.opportunity_observations_for(p_user uuid,p_opportunity text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('skillId',s.id,'status',coalesce(ls.status,'not_assessed'),'evidenceId',e.id,'kind',e.kind,'method',e.assessment_method,'outcome',e.outcome,'scope',e.scope,'rubricVersion',e.rubric_version,'sourceId',e.source_id,'attemptId',coalesce(e.practical_attempt_id,e.assessment_attempt_id),'evaluatedAt',e.evaluated_at) order by s.position,s.id),'[]')
 from public.skills s left join public.learner_skills ls on ls.skill_id=s.id and ls.user_id=p_user left join public.skill_evidence e on e.id=ls.last_evidence_id and e.user_id=p_user where exists(select 1 from public.opportunity_requirements r where r.opportunity_id=p_opportunity and r.skill_id=s.id);
$$;
revoke all on function public.opportunity_observations_for(uuid,text) from public,anon,authenticated;
create function public.get_opportunity_radar(p_opportunity text default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare learner uuid:=auth.uid(); result jsonb;
begin
 if learner is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_opportunity is not null and not exists(select 1 from public.opportunities where id=p_opportunity) then raise exception 'Example not found' using errcode='PT404';end if;
 select coalesce(jsonb_agg(jsonb_build_object('opportunity',o.content,'requirements',(select jsonb_agg(r.content order by r.id) from public.opportunity_requirements r where r.opportunity_id=o.id),'observations',public.opportunity_observations_for(learner,o.id),'saved',case when saved.user_id is null then null else jsonb_build_object('savedAt',saved.saved_at,'baseline',saved.baseline) end) order by o.id),'[]') into result from (select * from public.opportunities where p_opportunity is null or id=p_opportunity order by id limit 20) o left join public.saved_opportunities saved on saved.opportunity_id=o.id and saved.user_id=learner;
 return result;
end;
$$;
create function public.save_opportunity(p_opportunity text,p_request uuid,p_expected_saved boolean,p_saved boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare learner uuid:=auth.uid();prior public.opportunity_save_receipts;exists_saved boolean;receipt jsonb;
begin
 if learner is null then raise exception 'Authentication required' using errcode='42501';end if;
 if p_opportunity is null or p_request is null or p_expected_saved is null or p_saved is null or p_expected_saved=p_saved then raise exception 'Invalid save' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(learner::text,0));
 select * into prior from public.opportunity_save_receipts where user_id=learner and request_id=p_request;
 if found then if prior.opportunity_id<>p_opportunity or prior.expected_saved<>p_expected_saved or prior.saved<>p_saved then raise exception 'Request reused' using errcode='PT409';end if;return prior.result;end if;
 if not exists(select 1 from public.profiles where id=learner) then raise exception 'Passport required' using errcode='PT409';end if;
 if not exists(select 1 from public.opportunities where id=p_opportunity) then raise exception 'Example not found' using errcode='PT404';end if;
 select exists(select 1 from public.saved_opportunities where user_id=learner and opportunity_id=p_opportunity) into exists_saved;
 if exists_saved<>p_expected_saved then raise exception 'Saved state changed' using errcode='PT409';end if;
 if p_saved then insert into public.saved_opportunities(user_id,opportunity_id,baseline) values(learner,p_opportunity,public.opportunity_observations_for(learner,p_opportunity));else delete from public.saved_opportunities where user_id=learner and opportunity_id=p_opportunity;end if;
 receipt:=jsonb_build_object('opportunityId',p_opportunity,'saved',p_saved);
 insert into public.opportunity_save_receipts values(learner,p_request,p_opportunity,p_expected_saved,p_saved,receipt);return receipt;
end;
$$;
revoke all on function public.get_opportunity_radar(text),public.save_opportunity(text,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.get_opportunity_radar(text),public.save_opportunity(text,uuid,boolean,boolean) to authenticated;
create function public.get_journey_state() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare learner uuid:=auth.uid();goal uuid;result jsonb;
begin
 if learner is null then raise exception 'Authentication required' using errcode='42501';end if;
 select id into goal from public.learning_goals where user_id=learner and status='active';
 if goal is null then raise exception 'Passport required' using errcode='PT409';end if;
 select jsonb_build_object(
 'courseConfirmed',exists(select 1 from public.courses where user_id=learner and confirmed_revision is not null),
 'diagnosticReviewed',exists(select 1 from public.diagnostic_attempts where user_id=learner and status='evaluated'),
 'stepAccepted',exists(select 1 from public.learning_paths where user_id=learner and goal_id=goal and active_revision is not null),
 'mentorUsed',exists(select 1 from public.mentor_turns where user_id=learner and goal_id=goal and status='ready'),
 'practiceSubmitted',exists(select 1 from public.practical_attempts where user_id=learner and goal_id=goal and status='submitted'),
 'progressRecorded',exists(select 1 from public.practical_progress p join public.practical_attempts a on a.id=p.attempt_id and a.user_id=p.user_id where p.user_id=learner and a.goal_id=goal),
 'exampleSaved',exists(select 1 from public.saved_opportunities where user_id=learner)) into result;
 return result;
end;
$$;
revoke all on function public.get_journey_state() from public,anon,authenticated;
grant execute on function public.get_journey_state() to authenticated;
