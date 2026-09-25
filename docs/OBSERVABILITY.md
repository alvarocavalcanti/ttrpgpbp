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

### Realtime Connection Health

Supabase exposes Realtime metrics via the Reports dashboard or via prometheus. You can also monitor unexpected disconnects via Log Explorer on the `realtime` source.
