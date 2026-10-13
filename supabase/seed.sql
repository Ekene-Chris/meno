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
on conflict (id) do update set name = excluded.name, description = excluded.description, position = excluded.position;

insert into public.skill_prerequisites(skill_id, prerequisite_skill_id) values
  ('web.css-layout', 'web.html-basics'), ('js.conditions', 'js.variables'),
  ('js.functions', 'js.variables'), ('js.arrays', 'js.functions'), ('js.objects', 'js.variables'),
  ('web.dom', 'web.html-basics'), ('web.dom', 'js.functions'), ('js.promises', 'js.functions'),
  ('js.async-await', 'js.promises'), ('web.fetch-api', 'web.http-basics'),
  ('web.fetch-api', 'js.async-await'), ('web.fetch-api', 'js.objects'), ('web.accessibility', 'web.html-basics')
on conflict do nothing;
