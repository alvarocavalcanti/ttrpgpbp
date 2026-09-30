---
name: usage-report
description: Produce the Role by Post app-usage / adoption report from live database signals. Use when the user asks "app usage", "usage report", "are people really using it", "how many users/channels", "how many active tables", "adoption/launch metrics", or wants a growth/engagement snapshot. Aggregates only — never reads message content. Triggers ONLY for this report, not for schema, admin-console, or unrelated DB work.
license: MIT
metadata:
  owner: rolebypost
---

# Usage report

Queries the production database for **aggregate** adoption signals and renders a
report in chat. Read-only, zero cost (Supabase Management API, free on all
tiers), no new dependencies. On request it also saves the report as Markdown or
a standalone HTML file with graphs.

## Constants (keep in sync with `usage.sql`)

| Constant | Value | Meaning |
|---|---|---|
| `LAUNCH_AT` | `2026-09-28T14:48:00Z` | Official launch — the r/pbp post at **2026-09-28 15:48 +01:00**. Baseline for every "since launch" metric. |
| `ACTIVE_MIN_MSGS` | `15` | A table is "active" with **≥ 2 distinct human senders** and **≥ 15 non-system human messages**. Tune after reading the GM-only histogram. |
| `RECENT_WINDOW` | `14 days` | Window for the "active now" variant (`active_recent`). |

Definitions used by the query:

- **Human message** — a `messages` row with `sender_id IS NOT NULL` and
  `type <> 'system'` (so join/leave `system` rows don't inflate counts). Deleted
  messages still count: they were activity when posted.
- **Sender** — a distinct `messages.sender_id`. A `channel_members` row with no
  posts does **not** count, which is why sender count is the gate rather than
  member count.
- **Active table** — a non-archived channel with ≥ 2 distinct human senders and
  ≥ `ACTIVE_MIN_MSGS` human messages (lifetime, plus a last-`RECENT_WINDOW`
  variant).

## Run

From the repo root:

```bash
REF=$(jq -r .ref supabase/.temp/linked-project.json) \
  || { echo "No linked project. Run: npx supabase link --project-ref <ref>"; exit 1; }
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env | cut -d= -f2- | tr -d '"')
[ -n "$TOKEN" ] || { echo "SUPABASE_ACCESS_TOKEN missing from .env"; exit 1; }

jq -n --rawfile q .opencode/skills/usage-report/usage.sql '{query:$q, read_only:true}' \
  | curl -sS -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @- \
  | jq '.[0].report // .'
```

The endpoint returns `[{"report": { … }}]`; `jq '.[0].report // .'` unwraps it
(and surfaces a `{message, code}` error body unchanged). If the response has no
`report` key, stop and show the user the error — do not fabricate numbers.

> `read_only: true` enforces the safety rail. Never remove it, and never edit
> `usage.sql` to select `messages.content`, emails, or names — the report is
> aggregates only.

## Report template (chat)

Render the JSON as markdown, in this order. Lead with active tables and growth,
not vanity totals.

1. **Headline** — `active_lifetime` active tables, `funnel.sent_a_message`
   distinct senders, `growth.profiles_since_launch` signups since launch.
   One line each.
2. **Growth since launch** (`growth`) — totals and since-launch/7d/24h for
   profiles and non-archived channels; archived count.
3. **Adoption funnel** (`funnel`) — signups → joined a channel → sent a message
   → in an active table, with the step-to-step conversion %.
4. **Channel reality** (`channels`) — `active_lifetime` vs `active_recent`;
   the sender buckets and, notably, how many channels are still **GM-only**
   (`sender_buckets` "0"/"1"); the `gm_only_histogram` to justify the
   `ACTIVE_MIN_MSGS` threshold; the sender × message matrix.
5. **Engagement** (`engagement`) — human messages/day and distinct senders/day
   since launch; messages by type; dice rolls, reactions, safety cards, join
   failures; notification opt-ins.
6. **Retention** (`retention`) — launch-week cohort active in week 1 / 2 / 3,
   and how many joined but never posted.
7. **Admin mirror** (`admin_mirror`) — image storage bytes, abuse reports by
   status, suspended users. (Same numbers the `/admin` console shows.)

Keep the caveats visible: `active_recent` is the "still here" number, the
lifetime one is dominated by the launch spike; GM-only channels are almost
certainly the maintainer testing.

## Optional save (ask after presenting)

After showing the report, **ask** whether to also save it. Only write on an
explicit yes. Offer Markdown, HTML, or both.

- Destination: `.opencode/usage-reports/YYYY-MM-DD.{md,html}` (the directory is
  gitignored; create it on demand). The date is the report's `generated_at`.
- **Markdown** — the same sections/tables as the chat report.
- **HTML** — load `report.template.html`, replace the `__DATA__` token with the
  JSON payload, write the file. The template is self-contained: inline CSS and
  hand-rolled inline-SVG charts, **no CDN, no network, no dependency**. It
  renders: signups + channels/day (line), distinct senders/day (line), sender
  buckets (bar), GM-only histogram (bar), messages by type (bar), and the funnel
  as labelled bars.

Tell the user the saved path when done.
