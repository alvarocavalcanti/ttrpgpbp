# Observability

## Free-tier reality

On the Supabase free tier, logs are retained for roughly **1 day** and there are
no log drains. Log Alerts and longer retention require **Supabase Pro
($25/org/month)**. Sentry's free Developer quota is small (about 5k errors and
50 session replays per month). Practically, this means: **check the dashboard
within a day of any suspected incident**, and treat automated alerting as a
paid upgrade. The queries below still work for manual review.

## Client Telemetry (Sentry)

Client-side render errors and boundary catches are reported to Sentry.
To enable:

1. Create a Sentry account and a React project.
2. Provide `VITE_SENTRY_DSN` in the environment variables (e.g., Cloudflare Pages environment variables).

## Application error log

Client errors are also written to `public.app_error_log` through the
`report_app_error(...)` RPC (wired into `ErrorBoundary` and the JoinChannel
failure path). This survives the ~1-day Supabase log window and needs no paid
service. Every field is clamped server-side, the stored route is a pathname
only (any query string is stripped), and no message content is captured.

- Reads are **server-admin only** (RLS); writes go only through the RPC, so
  clients cannot insert directly.
- Query from the SQL editor / Studio:

  ```sql
  select created_at, user_id, route, message, detail
  from public.app_error_log
  order by created_at desc
  limit 100;
  ```

- There is no scheduled retention job yet — errors are rare and bounded.
  Prune manually when needed:

  ```sql
  delete from public.app_error_log where created_at < now() - interval '90 days';
  ```

## Google Analytics 4 (GA4)

Analytics is optional and build-time gated on `VITE_GA_MEASUREMENT_ID`; when it
is unset (local dev, self-hosted) every call below is a no-op. GA loads only
after the visitor accepts the consent banner. The app's manual `page_view`
sends **only the page path plus origin** — query strings and fragments are
stripped from that event, so search terms (e.g. lobby search) never leave the
device through it. That guarantee covers the manual event only; GA4's own
automatic page views are not controlled by the app. Automatic `page_view` on
the config call is disabled (`send_page_view: false`), and
`RouteTracker` sends the manual SPA page view instead. That flag does **not**
disable Enhanced Measurement's *Page changes based on browser history events*:
if that stream setting is on, GA4 can emit its own `page_view` on top of
`RouteTracker`'s, so a navigation may be counted twice. Turn it off in the
stream's Enhanced Measurement settings to rely on `RouteTracker` alone.

### Event reference

The property mixes two kinds of events: events the app emits explicitly via
`trackEvent(...)`, and GA4's own automatic/built-in events (Enhanced
Measurement is a property setting, not app code — confirm it under **Admin →
Data streams → [stream] → Enhanced measurement**). Use this table to read the
"by Event name" card on the Dashboard.

| Event | Origin | UX path it represents | Emitted from |
| --- | --- | --- | --- |
| `page_view` | App | Visitor loaded or navigated to a screen (SPA route change). Fires on each route: sign-in, lobby, archived, admin, join, channel, settings, changelog, about, legal, `/features`, dice roller, game-system/content pages, help. Params: `page_path`, `page_location` (origin + path, no query) | `App.tsx:97`, `AnalyticsConsentBanner.tsx:27`, `ProfileSettings.tsx:79` |
| `menu_open` | App | A nav drawer opened. Param `menu` = `main` (top hamburger) or `sidebar` (in-channel); `method` = `toggle`, `swipe`, or `action` | `App.tsx:131`, `ChannelView.tsx:110` |
| `menu_close` | App | Same drawer closed. `method` = `button`, `backdrop`, `swipe`, `escape`, `modal`, `toggle`, or `action` (sidebar auto-closed when an overlay opens) | `App.tsx:136`, `ChannelView.tsx:115,157` |
| `marketing_track_toggle` | App | On `/features`: visitor switched the GM vs Player feature track. Param `track` | `FeaturesPage.tsx:149` |
| `marketing_cta_click` | App | On `/features`: the "Start now!" CTA was clicked. Param `location` = `hero` or `bottom`. Falls below the Dashboard's top-10 cut-off at low volume | `FeaturesPage.tsx:134` |
| `scroll` | GA4 automatic (Enhanced Measurement) | Visitor scrolled 90% of a page. Not tied to a specific screen | — |
| `session_start` | GA4 automatic | A new session began | — |
| `first_visit` | GA4 automatic | First-ever visit from that browser/device | — |
| `user_engagement` | GA4 automatic | Page stayed foregrounded / engaged-session heartbeat | — |
| `form_start` | GA4 automatic (Enhanced Measurement) | Visitor touched the first field of a form. Carries `form_id`, `form_name`, and `form_destination` — register them as event-scoped custom dimensions to report them. The app's forms set none of those attributes, so the values are blank | — |
| `click` | GA4 automatic (Enhanced Measurement) | Outbound link click (leaving for another domain) | — |

### Seeing `page_view` with more detail

The Dashboard's Events card only shows the overall count. To break `page_view`
down by screen:

1. **Reports → Engagement → Pages and screens.** The table lists each
   `page_path` (e.g. `/`, `/settings`, `/channel/<id>`) with its **Views** —
   "Views" is the count of `page_view` events for that path. Sort, search, or
   click a row to filter the whole report to that screen.
2. **Reports → Realtime** for the last 30 minutes — its views card groups by
   **page title / screen name**, not path; use Pages and screens or Explore
   for a path breakdown.
3. **Explore** for a custom breakdown (the most flexible view):
   1. Open **Explore**, choose the **Free form** template.
   2. Under **Dimensions**, pick **Page path and screen class** (this is
      `page_path`), or **Page location** for the full `page_location`.
   3. Under **Metrics**, pick **Event count**.
   4. (Optional) Add a filter: dimension **Event name**, condition *exactly
      matches*, value `page_view`.
   5. Drag the page dimension into **Rows**, then add a breakdown dimension —
      e.g. `Session default channel group`, `Device category`, or `Country`.

Standard reports can take up to 24–48 hours to fill in; **Realtime** is
immediate.

Two quirks worth knowing:

- Each channel has its own id, so `/channel/<id>` shows as many separate rows.
  Group or filter rather than expecting one "channel" line.
- The app sends no `page_title`, so GA4 falls back to `document.title`; title
  dimensions are usually populated. On a lazy route (e.g. `/login`) the event
  can fire before the page sets its title, so it may carry the previous title.

### Breaking custom events down by parameter

The custom event parameters (`menu`, `method`, `track`, `location`) are hidden
until registered as dimensions:

1. **Admin → Data display → Custom definitions → Create custom dimension.**
2. Scope: **Event**. Event parameter name: `menu` (repeat for `method`,
   `track`, `location`). Give each a readable name, e.g. "Menu".
3. Allow up to 24–48 hours for the registered dimension to appear in reports
   (registering does not make events collected before registration
   reportable), then open **Explore**, filter to the event (e.g. `menu_open`),
   and add the new dimension as a breakdown.

## Realtime & Push Notifications Metrics

Supabase provides built-in metrics and Log Explorer.

### Push Delivery Alerts

To monitor failed push notifications, create a Log Alert in the Supabase Dashboard:

1. Go to Logs -> Log Alerts.
2. Create an alert for the `push_delivery_log` table.
3. Query:

   ```sql
   select *
   from public.push_delivery_log
   where status = 'failed' or status = 'transient';
   ```

4. Set the trigger condition (e.g., > 0 results in 5 minutes) and notification channel.

### Client-side push milestones (`push_client_log`)

`push_delivery_log` stops at "the push service accepted it". `push_client_log`
records what happened **on the device** — the service worker reporting that it
received a push, failed to parse the payload, displayed the notification, hit a
display error, or the user tapped it. Each row carries the correlation
`event_id` and the `subscription_id`, plus the reporting `user_agent`.

Which leg is dropping? A push is healthy end to end when the same `event_id`
has a `sent` row in `push_delivery_log` **and** a `shown` row in
`push_client_log` for each device:

```sql
-- Per-device trail for one event (server sent -> device received -> shown).
select d.user_id, d.subscription_id, d.status as server_status, c.status as client_status, c.created_at
from public.push_delivery_log d
left join public.push_client_log c
  on c.event_id = d.event_id and c.subscription_id = d.subscription_id
where d.event_id = '<event-id>';
```

```sql
-- Devices the server reached but that never reported a receipt (candidates
-- for a stale FCM/Apple endpoint or a service worker that is not running).
select d.subscription_id, d.user_id, max(d.created_at) as last_sent
from public.push_delivery_log d
where d.status = 'sent'
  and d.created_at > now() - interval '7 days'
  and not exists (
    select 1 from public.push_client_log c
    where c.subscription_id = d.subscription_id
      and c.event_id = d.event_id
      and c.status in ('received', 'shown')
  )
group by 1, 2
order by last_sent desc;
```

```sql
-- Payloads the worker could not parse (would otherwise drop silently).
select user_agent, detail, count(*)
from public.push_client_log
where status = 'invalid_payload'
group by 1, 2
order by 3 desc;
```

```sql
-- Self-heals: a device that lost its subscription and rebuilt it. Frequent
-- rows here mean subscriptions are churning and worth investigating.
select user_id, count(*) filter (where status = 'reconcile_ok') as recreated,
       count(*) filter (where status = 'reconcile_error') as failed
from public.push_client_log
where created_at > now() - interval '30 days'
group by 1
having count(*) filter (where status = 'reconcile_ok') > 0
order by 2 desc;
```

The client reports these receipts through the `push-receipt` edge function,
authenticated by the per-subscription `ack_token` (never by a JWT — a push can
arrive while the app is closed). The page also writes `subscribed`,
`unsubscribed`, `reconcile_ok`, and `reconcile_error` rows directly.

### Realtime Connection Health

Supabase exposes Realtime metrics via the Reports dashboard or via prometheus. You can also monitor unexpected disconnects via Log Explorer on the `realtime` source.
