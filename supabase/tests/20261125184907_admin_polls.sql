-- 20261125184907: admin polls (#824).
--
-- Covers: function/table grant hygiene, composer validation, the audience and
-- suspension visibility matrix, submission validation (required, bounds,
-- duplicate, at-least-one-answer), the closed state, and the aggregated admin
-- report.
--
-- RLS checks impersonate the authenticated role (SET LOCAL ROLE) because the
-- table owner bypasses row level security.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(74);

-- ===== Fixture =====
INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000008241', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'poll824admin@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000008242', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'poll824gm@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000008243', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'poll824player@example.com', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000008244', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'poll824player2@example.com', '', now(), '{}', '{}', now(), now());

UPDATE profiles SET server_admin = true WHERE id = '00000000-0000-0000-0000-000000008241';

-- GM-ness for 8242.
INSERT INTO channels (id, name, gm_id, invite_code)
VALUES ('00000000-0000-0000-0000-000000008250', 'Poll GM Channel', '00000000-0000-0000-0000-000000008242', '824abcde');

-- Suspension flips must run as postgres: the #300 trigger blocks any
-- is_suspended change while a JWT context is set.
CREATE OR REPLACE FUNCTION pg_temp.set_suspended(p_uid uuid, p_val boolean)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', false);
  SELECT set_config('request.jwt.claims', '{}', false);
  UPDATE profiles SET is_suspended = p_val WHERE id = p_uid;
$$;

CREATE OR REPLACE FUNCTION pg_temp.act_as(p_uid uuid)
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_uid::text, true);
  SELECT set_config('request.jwt.claims', jsonb_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
$$;

CREATE TEMP TABLE poll_ids (name text PRIMARY KEY, thread_id uuid);
GRANT ALL ON poll_ids TO authenticated;

-- ===== 1. Grant hygiene =====
SELECT is(has_function_privilege('anon', 'public.create_admin_poll(TEXT, public.admin_thread_audience, TEXT, JSONB)', 'EXECUTE'), false, 'anon cannot create a poll');
SELECT is(has_function_privilege('anon', 'public.submit_admin_poll_response(UUID, JSONB)', 'EXECUTE'), false, 'anon cannot submit a poll');
SELECT is(has_function_privilege('anon', 'public.close_admin_poll(UUID)', 'EXECUTE'), false, 'anon cannot close a poll');
SELECT is(has_function_privilege('anon', 'public.get_admin_poll_report(UUID)', 'EXECUTE'), false, 'anon cannot read the poll report');
SELECT is(has_function_privilege('authenticated', 'public.create_admin_poll(TEXT, public.admin_thread_audience, TEXT, JSONB)', 'EXECUTE'), true, 'authenticated can create a poll');
SELECT is(has_function_privilege('authenticated', 'public.submit_admin_poll_response(UUID, JSONB)', 'EXECUTE'), true, 'authenticated can submit a poll');

SELECT is(has_table_privilege('anon', 'public.admin_polls', 'SELECT'), false, 'anon cannot read admin_polls');
SELECT is(has_table_privilege('anon', 'public.admin_poll_questions', 'SELECT'), false, 'anon cannot read admin_poll_questions');
SELECT is(has_table_privilege('anon', 'public.admin_poll_responses', 'SELECT'), false, 'anon cannot read admin_poll_responses');
SELECT is(has_table_privilege('anon', 'public.admin_poll_answers', 'SELECT'), false, 'anon cannot read admin_poll_answers');

-- ===== 2. Composer authorization and validation =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008243');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT create_admin_poll('Nope', 'all_users', NULL, '[{"prompt":"Q","question_type":"short_text","is_required":true}]'::jsonb)$$,
  'P0001', 'Not authorized',
  'a non-admin cannot create a poll'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008241');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT create_admin_poll('', 'all_users', NULL, '[{"prompt":"Q","question_type":"short_text","is_required":true}]'::jsonb)$$,
  'P0001', 'A subject is required (100 characters max).',
  'an empty subject is refused'
);
SELECT throws_ok(
  $$SELECT create_admin_poll('Subject', 'all_users', NULL, '[]'::jsonb)$$,
  'P0001', 'A poll needs at least one question.',
  'a poll with no questions is refused'
);
SELECT throws_ok(
  $$SELECT create_admin_poll('Subject', 'all_users', NULL, '[{"prompt":"Q","question_type":"single_choice","is_required":true,"options":["only"]}]'::jsonb)$$,
  'P0001', 'Choice questions need 2 to 5 options.',
  'a choice question with one option is refused'
);
SELECT throws_ok(
  $$SELECT create_admin_poll('Subject', 'all_users', NULL, '[{"prompt":"Q","question_type":"multi_choice","is_required":true,"options":["a","b","c","d","e","f"]}]'::jsonb)$$,
  'P0001', 'Choice questions need 2 to 5 options.',
  'a choice question with six options is refused'
);
SELECT throws_ok(
  $$SELECT create_admin_poll('Subject', 'all_users', NULL, '[{"prompt":"Q","question_type":"single_choice","is_required":true,"options":["ok","   "]}]'::jsonb)$$,
  'P0001', 'Each option needs a label (150 characters max).',
  'a blank option label is refused'
);
SELECT throws_ok(
  $$SELECT create_admin_poll('Subject', 'all_users', NULL, '[{"prompt":"Q","question_type":"single_choice","is_required":true,"options":["ok",null]}]'::jsonb)$$,
  'P0001', 'Each option needs a label (150 characters max).',
  'a JSON null option label is refused'
);
RESET ROLE;

-- ===== 3. Create a poll =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008241');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO poll_ids (name, thread_id)
    SELECT 'p1', create_admin_poll(
      '  Community feedback  ',
      'all_users',
      '  Tell us how it is going.  ',
      '[
        {"prompt":"Which room do you use most?","question_type":"single_choice","is_required":true,"options":["Main","Rooms","Both"]},
        {"prompt":"Which features matter?","question_type":"multi_choice","is_required":false,"options":["Dice","Images"]},
        {"prompt":"Anything else?","question_type":"short_text","is_required":false}
      ]'::jsonb
    )$$,
  'the admin can publish a poll'
);
RESET ROLE;

SELECT is(
  (SELECT subject FROM admin_threads WHERE id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  'Community feedback',
  'the subject is trimmed and stored'
);
SELECT is(
  (SELECT audience FROM admin_threads WHERE id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  'all_users'::public.admin_thread_audience,
  'the audience is stored on the thread'
);
SELECT is(
  (SELECT description FROM admin_polls WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  'Tell us how it is going.',
  'the description is trimmed and stored'
);
SELECT is(
  (SELECT count(*) FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  3::bigint,
  'all three questions are stored'
);
SELECT is(
  (SELECT options FROM admin_poll_questions
    WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 1),
  '["Dice", "Images"]'::jsonb,
  'choice options keep their order'
);
SELECT is(
  (SELECT content FROM admin_messages WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  'Tell us how it is going.',
  'the intro note is the thread preview message'
);
SELECT is(
  (SELECT count(*) FROM admin_thread_reads
    WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')
      AND user_id = '00000000-0000-0000-0000-000000008241'),
  1::bigint,
  'publishing marks the poll read for its author'
);

-- ===== 4. Audience and suspension visibility =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008243');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  1::bigint,
  'a player sees an all_users poll thread'
);
SELECT is(
  (SELECT count(*) FROM admin_polls WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  1::bigint,
  'a player sees the poll'
);
SELECT is(
  (SELECT count(*) FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  3::bigint,
  'a player sees the poll questions'
);
SELECT is(
  get_admin_unread_count('00000000-0000-0000-0000-000000008243'),
  1,
  'the unread counter includes the poll'
);
RESET ROLE;

-- A suspended player loses the poll entirely.
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000008244', true);
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008244');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  0::bigint,
  'a suspended player cannot see the poll thread'
);
SELECT is(
  (SELECT count(*) FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  0::bigint,
  'a suspended player cannot see the poll questions'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response((SELECT thread_id FROM poll_ids WHERE name = 'p1'), '[]'::jsonb)$$,
  'P0001', 'Poll not found.',
  'a suspended player cannot submit'
);
RESET ROLE;
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000008244', false);

-- A GMs-only poll stays invisible to a regular player.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008241');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO poll_ids (name, thread_id)
    SELECT 'p2', create_admin_poll(
      'GM pulse',
      'gms',
      NULL,
      '[{"prompt":"Is prep hard?","question_type":"single_choice","is_required":true,"options":["Yes","No"]}]'::jsonb
    )$$,
  'the admin can publish a GMs-only poll'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008243');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE id = (SELECT thread_id FROM poll_ids WHERE name = 'p2')),
  0::bigint,
  'a player cannot see a GMs-only poll thread'
);
SELECT throws_ok(
  $$SELECT mark_admin_thread_read((SELECT thread_id FROM poll_ids WHERE name = 'p2'))$$,
  'P0001', 'Thread not found.',
  'a player cannot mark a GMs-only poll read'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response((SELECT thread_id FROM poll_ids WHERE name = 'p2'), '[]'::jsonb)$$,
  'P0001', 'Poll not found.',
  'a player cannot submit to a GMs-only poll'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008242');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE id = (SELECT thread_id FROM poll_ids WHERE name = 'p2')),
  1::bigint,
  'an active GM sees a GMs-only poll thread'
);
RESET ROLE;

-- A suspended GM loses the GMs-only poll too (is_active_gm parity).
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000008242', true);
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008242');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_threads WHERE id = (SELECT thread_id FROM poll_ids WHERE name = 'p2')),
  0::bigint,
  'a suspended GM cannot see a GMs-only poll thread'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response((SELECT thread_id FROM poll_ids WHERE name = 'p2'), '[]'::jsonb)$$,
  'P0001', 'Poll not found.',
  'a suspended GM cannot submit to a GMs-only poll'
);
RESET ROLE;
SELECT pg_temp.set_suspended('00000000-0000-0000-0000-000000008242', false);

-- A browser client cannot forge a poll thread: only create_admin_poll writes
-- them, so there is no INSERT policy for the type.
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008241');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO admin_threads (type, subject, audience, created_by)
    VALUES ('poll', 'Forged', 'all_users', '00000000-0000-0000-0000-000000008241')$$,
  '42501', 'new row violates row-level security policy for table "admin_threads"',
  'a client cannot insert a poll thread directly'
);
RESET ROLE;

-- ===== 5. Submission validation =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008242');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      '[{"question_id":"00000000-0000-0000-0000-000000000000","selected_options":[0]}]'::jsonb)$$,
  'P0001', 'Invalid answers.',
  'an answer for a question outside the poll is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(0, 1))))$$,
  'P0001', 'Only one option may be selected.',
  'two options on a single-choice question are refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(9))))$$,
  'P0001', 'Invalid option selection.',
  'an out-of-range option index is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(0, 0))))$$,
  'P0001', 'Duplicate option selection.',
  'a repeated option index is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(
        jsonb_build_object(
          'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
          'selected_options', jsonb_build_array(0)),
        jsonb_build_object(
          'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 2),
          'text_answer', repeat('x', 501))))$$,
  'P0001', 'Text answers are limited to 500 characters.',
  'a short text answer over 500 characters is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      '[]'::jsonb)$$,
  'P0001', 'Please answer all required questions.',
  'a missing required answer is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(0),
        'text_answer', 'not a choice')))$$,
  'P0001', 'Invalid answer for a choice question.',
  'a text answer on a choice question is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(
        jsonb_build_object(
          'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
          'selected_options', jsonb_build_array(0)),
        jsonb_build_object(
          'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
          'selected_options', jsonb_build_array(1))))$$,
  'P0001', 'Invalid answers.',
  'the same question answered twice is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(0),
        'text_answer', 42)))$$,
  'P0001', 'Invalid answers.',
  'a non-string text answer is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', 'two')))$$,
  'P0001', 'Invalid answers.',
  'a non-array option selection is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(1.5))))$$,
  'P0001', 'Invalid option selection.',
  'a fractional option index is refused'
);
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(9999999999))))$$,
  'P0001', 'Invalid option selection.',
  'an overflowing option index is refused instead of raising a cast error'
);
RESET ROLE;

-- ===== 6. A valid submission and the one-submission rule =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008242');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(
        jsonb_build_object(
          'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
          'selected_options', jsonb_build_array(1)),
        jsonb_build_object(
          'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 1),
          'selected_options', jsonb_build_array(0, 1)),
        jsonb_build_object(
          'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 2),
          'text_answer', '  Great work  ')
      ))$$,
  'an eligible user submits once'
);
RESET ROLE;

SELECT is(
  (SELECT text_answer FROM admin_poll_answers
    WHERE question_id = (SELECT id FROM admin_poll_questions
      WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 2)),
  'Great work',
  'short text answers are trimmed'
);

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008242');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(0))))$$,
  'P0001', 'You have already submitted a response to this poll.',
  'a second submission is refused'
);
RESET ROLE;

-- ===== 7. At least one answer overall =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008241');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO poll_ids (name, thread_id)
    SELECT 'p3', create_admin_poll(
      'All optional',
      'all_users',
      NULL,
      '[{"prompt":"Anything to add?","question_type":"short_text","is_required":false}]'::jsonb
    )$$,
  'the admin can publish an all-optional poll'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008243');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT submit_admin_poll_response((SELECT thread_id FROM poll_ids WHERE name = 'p3'), '[]'::jsonb)$$,
  'P0001', 'Please answer at least one question before submitting.',
  'a completely empty submission is refused'
);
SELECT lives_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p3'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p3') AND position = 0),
        'text_answer', 'Looks good')))$$,
  'answering one optional question is enough'
);
RESET ROLE;

-- ===== 8. Second respondent on p1, then the report =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008243');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(1))))$$,
  'a second user submits the required question only'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008243');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM get_admin_poll_report((SELECT thread_id FROM poll_ids WHERE name = 'p1'))$$,
  'P0001', 'Not authorized',
  'a non-admin cannot read the poll report'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008241');
SET LOCAL ROLE authenticated;
SELECT is(
  (get_admin_poll_report((SELECT thread_id FROM poll_ids WHERE name = 'p1'))->>'views')::integer,
  2,
  'the report counts two distinct views'
);
SELECT is(
  (get_admin_poll_report((SELECT thread_id FROM poll_ids WHERE name = 'p1'))->>'replies')::integer,
  2,
  'the report counts two replies'
);
SELECT is(
  (get_admin_poll_report((SELECT thread_id FROM poll_ids WHERE name = 'p1'))->'questions'->0->'option_counts'),
  '[0, 2, 0]'::jsonb,
  'the single-choice option counts are aggregated'
);
SELECT is(
  (get_admin_poll_report((SELECT thread_id FROM poll_ids WHERE name = 'p1'))->'questions'->1->'option_counts'),
  '[1, 1]'::jsonb,
  'the multi-choice option counts are aggregated'
);
SELECT is(
  (get_admin_poll_report((SELECT thread_id FROM poll_ids WHERE name = 'p1'))->'questions'->2->'text_answers'),
  '["Great work"]'::jsonb,
  'text answers are returned without attribution'
);
RESET ROLE;

-- ===== 9. Closing the poll =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008243');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT close_admin_poll((SELECT thread_id FROM poll_ids WHERE name = 'p1'))$$,
  'P0001', 'Not authorized',
  'a non-admin cannot close a poll'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008241');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT close_admin_poll('00000000-0000-0000-0000-000000000000')$$,
  'P0001', 'Poll not found.',
  'closing a poll that does not exist is refused'
);
SELECT lives_ok(
  $$SELECT close_admin_poll((SELECT thread_id FROM poll_ids WHERE name = 'p1'))$$,
  'the admin can close a poll'
);
SELECT isnt(
  get_admin_poll_report((SELECT thread_id FROM poll_ids WHERE name = 'p1'))->>'closed_at',
  NULL,
  'the report shows the closed timestamp'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008244');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT submit_admin_poll_response(
      (SELECT thread_id FROM poll_ids WHERE name = 'p1'),
      jsonb_build_array(jsonb_build_object(
        'question_id', (SELECT id FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1') AND position = 0),
        'selected_options', jsonb_build_array(0))))$$,
  'P0001', 'This poll is closed.',
  'a closed poll refuses new submissions'
);
RESET ROLE;

-- ===== 10. Eligible users still read the questions of a closed poll =====
SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008244');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_poll_questions WHERE thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  3::bigint,
  'an eligible user still reads the questions of a closed poll'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008243');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_poll_answers a
    JOIN admin_poll_responses r ON r.id = a.response_id
    WHERE r.thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')
      AND r.user_id <> '00000000-0000-0000-0000-000000008243'),
  0::bigint,
  'a user cannot read another user''s answers'
);
SELECT is(
  (SELECT count(*) FROM admin_poll_answers a
    JOIN admin_poll_questions q ON q.id = a.question_id
    WHERE q.thread_id = (SELECT thread_id FROM poll_ids WHERE name = 'p1')),
  1::bigint,
  'a respondent reads their own answers'
);
RESET ROLE;

SELECT pg_temp.act_as('00000000-0000-0000-0000-000000008241');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*) FROM admin_poll_answers),
  0::bigint,
  'the admin cannot read raw answers through the browser (report RPC only)'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
