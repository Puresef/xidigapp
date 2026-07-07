-- ============================================================================
-- Xidig — PRD-alignment: Lab playbook starter set (§16, spec §1b)
-- ============================================================================
-- lab_playbooks shipped empty in Phase 0 (schema only). The Lab create /
-- charter-setup flow needs starter charters so a new Space can pre-fill its
-- charter (problem_statement / hypothesis / success_definition) from a template
-- the user then edits.
--
-- Starter set (broader than §16's venture-type list, per Warya 8 Jul): six
-- collaboration archetypes covering how members actually form Spaces —
-- community, startup, research, local-service, creative, technical.
--
--   template jsonb shape (consumed by the SpaceForm playbook picker):
--     { "problem_statement": text, "hypothesis": text, "success_definition": text }
--
-- Names are English; the app localizes displayed labels via @xidig/i18n. source
-- = 'seed' marks these as platform-provided (§21). Idempotent on slug.
-- ============================================================================

insert into lab_playbooks (slug, name, venture_type, template, source) values
  (
    'community',
    'Community project',
    'community',
    jsonb_build_object(
      'problem_statement', 'A group in our community shares a need or goal that no one is coordinating yet.',
      'hypothesis',        'If we organize the right people around a clear shared goal, we can make steady, visible progress together.',
      'success_definition', 'An active group with regular participation and at least one tangible outcome delivered to the community.'
    ),
    'seed'
  ),
  (
    'startup',
    'Startup / venture idea',
    'startup',
    jsonb_build_object(
      'problem_statement', 'A real customer problem is underserved, and people would pay for a better solution.',
      'hypothesis',        'A small, focused product can solve this problem well enough that early users adopt and recommend it.',
      'success_definition', 'A working first version with paying or committed early users and a clear signal of demand.'
    ),
    'seed'
  ),
  (
    'research',
    'Research / learning circle',
    'research',
    jsonb_build_object(
      'problem_statement', 'There is a topic or question we want to understand deeply but lack a structured way to explore it.',
      'hypothesis',        'A consistent group working through the material together will build understanding faster than working alone.',
      'success_definition', 'A shared body of notes, findings, or a summary the group and others can learn from.'
    ),
    'seed'
  ),
  (
    'local-service',
    'Local service / business collaboration',
    'local-service',
    jsonb_build_object(
      'problem_statement', 'A local service or business need is being met poorly or not at all in our area.',
      'hypothesis',        'Partnering to offer or improve this service locally will attract steady demand from the community.',
      'success_definition', 'A running service with repeat customers and a workable model for sustaining it.'
    ),
    'seed'
  ),
  (
    'creative',
    'Creative / media project',
    'creative',
    jsonb_build_object(
      'problem_statement', 'A story, message, or creative work needs a team to bring it to life and reach an audience.',
      'hypothesis',        'Combining our creative skills around a shared vision will produce work that resonates and gets seen.',
      'success_definition', 'A published creative work with a real audience and feedback we can build on.'
    ),
    'seed'
  ),
  (
    'technical',
    'Technical build / software project',
    'technical',
    jsonb_build_object(
      'problem_statement', 'A useful tool or system does not exist yet, or existing options do not fit our needs.',
      'hypothesis',        'A focused team can build a working version that people actually use, iterating from a small core.',
      'success_definition', 'A deployed, working build with real users and a maintainable path for further development.'
    ),
    'seed'
  )
on conflict (slug) do nothing;
