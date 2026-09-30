-- App usage report — read-only aggregate signal query.
--
-- Single statement, returns one JSON row (`{"report": { ... }}`). Aggregates
-- only: it never selects message content, emails, or display names.
--
-- Run it through the Supabase Management API (see SKILL.md). The tunables below
-- must stay in sync with the constants documented in SKILL.md:
--   launch_at       official launch — 2026-09-28 15:48 +01:00 (= 14:48 UTC)
--   active_min_msgs a table is "active" with >= 2 distinct human senders
--                   and >= this many non-system human messages
--   recent_window   recency window for the "active now" variant

WITH params AS (
  SELECT
    '2026-09-28T14:48:00Z'::timestamptz AS launch_at,
    15::int                             AS active_min_msgs,
    interval '14 days'                  AS recent_window,
    now()                               AS at
),
-- Human, non-system messages only. `is_deleted` is intentionally NOT filtered:
-- a posted-then-deleted message was still activity (and still inflated a
-- channel's participation).
human AS (
  SELECT m.channel_id, m.sender_id, m.type, m.created_at
  FROM messages m
  WHERE m.sender_id IS NOT NULL
    AND m.type <> 'system'
),
-- Per non-archived channel: distinct human senders + non-system message count,
-- lifetime and within the recency window.
chan AS (
  SELECT
    c.id,
    COUNT(DISTINCT h.sender_id) AS senders,
    COUNT(h.sender_id) AS msgs,
    COUNT(DISTINCT h.sender_id) FILTER (
      WHERE h.created_at >= (SELECT at FROM params) - (SELECT recent_window FROM params)
    ) AS senders_recent,
    COUNT(h.sender_id) FILTER (
      WHERE h.created_at >= (SELECT at FROM params) - (SELECT recent_window FROM params)
    ) AS msgs_recent
  FROM channels c
  LEFT JOIN human h ON h.channel_id = c.id
  WHERE NOT c.is_archived
  GROUP BY c.id
)
SELECT json_build_object(
  'generated_at', (SELECT at FROM params),
  'launch_at', (SELECT launch_at FROM params),
  'growth', json_build_object(
    'total_profiles', (SELECT count(*) FROM profiles),
    'profiles_since_launch', (SELECT count(*) FROM profiles WHERE created_at >= (SELECT launch_at FROM params)),
    'profiles_7d', (SELECT count(*) FROM profiles WHERE created_at >= now() - interval '7 days'),
    'profiles_24h', (SELECT count(*) FROM profiles WHERE created_at >= now() - interval '24 hours'),
    'active_channels', (SELECT count(*) FROM channels WHERE NOT is_archived),
    'channels_since_launch', (SELECT count(*) FROM channels WHERE NOT is_archived AND created_at >= (SELECT launch_at FROM params)),
    'channels_7d', (SELECT count(*) FROM channels WHERE NOT is_archived AND created_at >= now() - interval '7 days'),
    'channels_24h', (SELECT count(*) FROM channels WHERE NOT is_archived AND created_at >= now() - interval '24 hours'),
    'archived_channels', (SELECT count(*) FROM channels WHERE is_archived),
    'signups_per_day', (
      SELECT COALESCE(json_agg(json_build_object('day', day, 'n', n) ORDER BY day), '[]'::json)
      FROM (
        SELECT created_at::date AS day, count(*) AS n
        FROM profiles
        WHERE created_at >= (SELECT launch_at FROM params)
        GROUP BY 1
      ) t
    ),
    'channels_per_day', (
      SELECT COALESCE(json_agg(json_build_object('day', day, 'n', n) ORDER BY day), '[]'::json)
      FROM (
        SELECT created_at::date AS day, count(*) AS n
        FROM channels
        WHERE NOT is_archived AND created_at >= (SELECT launch_at FROM params)
        GROUP BY 1
      ) t
    )
  ),
  'funnel', json_build_object(
    'signups', (SELECT count(*) FROM profiles),
    'joined_a_channel', (SELECT count(DISTINCT user_id) FROM channel_members),
    'sent_a_message', (SELECT count(DISTINCT sender_id) FROM human),
    'in_active_table', (
      SELECT count(DISTINCT h.sender_id)
      FROM human h
      JOIN chan ON chan.id = h.channel_id
      WHERE chan.senders >= 2 AND chan.msgs >= (SELECT active_min_msgs FROM params)
    )
  ),
  'channels', json_build_object(
    'active_lifetime', (
      SELECT count(*) FROM chan
      WHERE senders >= 2 AND msgs >= (SELECT active_min_msgs FROM params)
    ),
    'active_recent', (
      SELECT count(*) FROM chan
      WHERE senders_recent >= 2 AND msgs_recent >= (SELECT active_min_msgs FROM params)
    ),
    'sender_buckets', (
      SELECT COALESCE(json_agg(json_build_object('senders', b, 'channels', n) ORDER BY ord), '[]'::json)
      FROM (
        SELECT
          CASE senders WHEN 0 THEN '0' WHEN 1 THEN '1' WHEN 2 THEN '2' ELSE '3+' END AS b,
          CASE senders WHEN 0 THEN 0 WHEN 1 THEN 1 WHEN 2 THEN 2 ELSE 3 END AS ord,
          count(*) AS n
        FROM chan GROUP BY 1, 2
      ) t
    ),
    'sender_message_matrix', (
      SELECT COALESCE(json_agg(json_build_object('senders', sb, 'msgs', mb, 'channels', n)), '[]'::json)
      FROM (
        SELECT
          CASE senders WHEN 0 THEN '0' WHEN 1 THEN '1' WHEN 2 THEN '2' ELSE '3+' END AS sb,
          CASE WHEN msgs < 15 THEN '<15' WHEN msgs < 50 THEN '15-49' ELSE '50+' END AS mb,
          count(*) AS n
        FROM chan GROUP BY 1, 2
      ) t
    ),
    'gm_only_histogram', (
      SELECT COALESCE(json_agg(json_build_object('bucket', bucket, 'channels', n) ORDER BY ord), '[]'::json)
      FROM (
        SELECT
          CASE
            WHEN msgs = 0 THEN '0'
            WHEN msgs <= 4 THEN '1-4'
            WHEN msgs <= 9 THEN '5-9'
            WHEN msgs <= 14 THEN '10-14'
            WHEN msgs <= 19 THEN '15-19'
            WHEN msgs <= 49 THEN '20-49'
            ELSE '50+'
          END AS bucket,
          CASE
            WHEN msgs = 0 THEN 0 WHEN msgs <= 4 THEN 1 WHEN msgs <= 9 THEN 2
            WHEN msgs <= 14 THEN 3 WHEN msgs <= 19 THEN 4 WHEN msgs <= 49 THEN 5
            ELSE 6
          END AS ord,
          count(*) AS n
        FROM chan
        WHERE senders <= 1
        GROUP BY 1, 2
      ) t
    )
  ),
  'engagement', json_build_object(
    'messages_by_type', (
      SELECT json_build_object(
        'regular', count(*) FILTER (WHERE type = 'regular'),
        'scene', count(*) FILTER (WHERE type = 'scene'),
        'dice_roll', count(*) FILTER (WHERE type = 'dice_roll')
      )
      FROM human
    ),
    'messages_per_day', (
      SELECT COALESCE(json_agg(json_build_object('day', day, 'messages', n) ORDER BY day), '[]'::json)
      FROM (
        SELECT created_at::date AS day, count(*) AS n
        FROM human
        WHERE created_at >= (SELECT launch_at FROM params)
        GROUP BY 1
      ) t
    ),
    'senders_per_day', (
      SELECT COALESCE(json_agg(json_build_object('day', day, 'senders', n) ORDER BY day), '[]'::json)
      FROM (
        SELECT created_at::date AS day, count(DISTINCT sender_id) AS n
        FROM human
        WHERE created_at >= (SELECT launch_at FROM params)
        GROUP BY 1
      ) t
    ),
    'dice_rolls_total', (SELECT count(*) FROM dice_rolls),
    'dice_rolls_since_launch', (SELECT count(*) FROM dice_rolls WHERE created_at >= (SELECT launch_at FROM params)),
    'reactions_total', (SELECT count(*) FROM message_reactions),
    'reactions_since_launch', (SELECT count(*) FROM message_reactions WHERE created_at >= (SELECT launch_at FROM params)),
    'safety_cards_total', (SELECT count(*) FROM safety_card_events),
    'safety_cards_since_launch', (SELECT count(*) FROM safety_card_events WHERE created_at >= (SELECT launch_at FROM params)),
    'join_failure_pairs', (SELECT count(*) FROM channel_join_failures WHERE fail_count > 0),
    'join_failure_attempts', (SELECT COALESCE(sum(fail_count), 0) FROM channel_join_failures),
    'notification_prefs', (
      SELECT json_build_object(
        'rows', count(*),
        'push_enabled', count(*) FILTER (WHERE push_enabled),
        'badge_enabled', count(*) FILTER (WHERE badge_enabled),
        'email_enabled', count(*) FILTER (WHERE email_enabled)
      )
      FROM notification_preferences
    )
  ),
  'retention', json_build_object(
    'launch_week_signups', (
      SELECT count(*) FROM profiles
      WHERE created_at >= (SELECT launch_at FROM params)
        AND created_at < (SELECT launch_at FROM params) + interval '7 days'
    ),
    'cohort_sent_week1', (
      SELECT count(DISTINCT p.id) FROM profiles p
      WHERE p.created_at >= (SELECT launch_at FROM params)
        AND p.created_at < (SELECT launch_at FROM params) + interval '7 days'
        AND EXISTS (
          SELECT 1 FROM human h WHERE h.sender_id = p.id
            AND h.created_at < (SELECT launch_at FROM params) + interval '7 days'
        )
    ),
    'cohort_sent_week2', (
      SELECT count(DISTINCT p.id) FROM profiles p
      WHERE p.created_at >= (SELECT launch_at FROM params)
        AND p.created_at < (SELECT launch_at FROM params) + interval '7 days'
        AND EXISTS (
          SELECT 1 FROM human h WHERE h.sender_id = p.id
            AND h.created_at >= (SELECT launch_at FROM params) + interval '7 days'
            AND h.created_at < (SELECT launch_at FROM params) + interval '14 days'
        )
    ),
    'cohort_sent_week3', (
      SELECT count(DISTINCT p.id) FROM profiles p
      WHERE p.created_at >= (SELECT launch_at FROM params)
        AND p.created_at < (SELECT launch_at FROM params) + interval '7 days'
        AND EXISTS (
          SELECT 1 FROM human h WHERE h.sender_id = p.id
            AND h.created_at >= (SELECT launch_at FROM params) + interval '14 days'
            AND h.created_at < (SELECT launch_at FROM params) + interval '21 days'
        )
    ),
    'joined_never_posted', (
      SELECT count(DISTINCT cm.user_id) FROM channel_members cm
      WHERE NOT EXISTS (SELECT 1 FROM human h WHERE h.sender_id = cm.user_id)
    )
  ),
  'admin_mirror', json_build_object(
    'image_storage_bytes', (
      SELECT COALESCE(SUM((metadata->>'size')::bigint), 0)
      FROM storage.objects WHERE bucket_id = 'images'
    ),
    'abuse_reports_pending', (SELECT count(*) FROM abuse_reports WHERE status = 'pending'),
    'abuse_reports_resolved', (SELECT count(*) FROM abuse_reports WHERE status = 'resolved'),
    'abuse_reports_dismissed', (SELECT count(*) FROM abuse_reports WHERE status = 'dismissed'),
    'suspended_users', (SELECT count(*) FROM profiles WHERE is_suspended)
  )
) AS report;
