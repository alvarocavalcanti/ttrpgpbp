---
description: Pre-PR diff review against the CodeRabbit-anticipation checklist. Read-only; reports findings and never edits.
mode: subagent
permissions:
  - action: edit
    resource: "*"
    effect: deny
  - action: subagent
    resource: "*"
    effect: deny
  - action: shell
    resource: "*"
    effect: deny
  - action: shell
    resource: "git diff*"
    effect: allow
  - action: shell
    resource: "git log*"
    effect: allow
  - action: shell
    resource: "git show*"
    effect: allow
  - action: shell
    resource: "git status*"
    effect: allow
---

# CodeRabbit-anticipation review

Review the current diff (`git diff origin/main...HEAD`, plus any uncommitted work) as a skeptical reviewer who has seen what CodeRabbit flags on this repo. Report findings only, severity-ordered, each with `path:line`, the problem in plain English, and the smallest fix. No praise, no style nits unless they change behavior. Verify every finding against the code before reporting; drop anything speculative.

Walk the diff through the checklist below. Each item is a question about the change, not a generic rule.

## 1. Stale async completions (the most common finding)

For every `await` continuation (fetch, RPC, Supabase query, realtime handler, upload, timer, debounce flush):

- If the room, user, channel, thread, draft, surface, or URL it started for changed while it was in flight, does the continuation still write state, error, loading, or cache? A `mountedRef` or ID match is not enough when A→B→A reuses the ID — it needs a generation/visit/identity token captured before the await and rechecked after.
- Loading and error updates are scoped too: a superseded request's `finally` must not clear the current request's spinner, and its failure must not show an error on the current entity.
- State owned by another entity must not be written: pagination errors, reply targets, drafts, unread holds, expanded rows.

## 2. Tests that actually exercise the change

- Is there a test for the exact interleaving being fixed (A→B→A, pending purge, live event landing mid-fetch, slow cache read)?
- Does each test fail without the fix? Check that the route and preconditions it renders are the ones under test, that the component is not silently unmounted, and that assertions cover intermediate writes, not just the final state.
- No negative `waitFor` that can pass during a spinner; wait for real elements with `findByRole`. No fake timers mixed with `waitFor`.

## 3. Offline cache and persistence

- Hydration must not restore data the server deleted, and fetched results must reconcile with, not be reduced over, cached state (both orderings).
- An empty or uninitialized state must not overwrite a saved snapshot; persistence waits for hydration and pending fetches, including the failure path.
- Malformed or null cache rows must not crash startup.
- Sign-out purge vs late writes: tombstone check and write in one `readwrite` transaction; purge enumeration and tombstone likewise; no tab may re-write a purged user's data.
- No unbounded `await` on IndexedDB open or purge; auth flows get a deadline.
- A skipped offline initial fetch is revalidated on the first `SUBSCRIBED`/`online`.

## 4. SQL, RLS, and validation

- RPC input validation rejects malformed JSON: null, non-string, non-array, whitespace or tab-only, wrong types; labels and UUIDs compared in normalized form.
- Realtime DELETE events skip RLS — do they broadcast anything sensitive?
- RLS tests query each table directly with a positive and a negative case; a join that masks a policy does not count.
- Metric populations are consistent (the author is included everywhere or nowhere).
- New relations: explicit grants to `authenticated` and `service_role`, RLS enabled with policies.

## 5. UI states

- Every async fetch has loading, error (with Retry when sensible), and empty states; a failed sub-request degrades instead of blanking the screen.
- Controls are disabled while a mutation is pending; no double submit; a stale modal closes when its entity changes.
- Content is not cleared while revalidating; a failed refresh keeps the previous data.

## 6. Claims match behavior

- Changelog, help, comparison, and marketing copy describe what the code actually does, including conditions and platform ("on desktop", "for rooms you opened"). Check that named UI (buttons, routes) exists before citing it.
- Comments and docs state the real number or mechanism (pin counts, thresholds, analytics events).

## 7. Small but real

- `maxLength` counts UTF-16 units; use code points where the database counts characters.
- No user data or query text in `console.*` that reaches Sentry breadcrumbs.
- `sessionStorage`/`localStorage` failures are best-effort and never block auth.
- 320px layout: no wrap-induced shift; reserve height for the loading→loaded dimension change.
- URL mirror effects must not rewrite a consumed deep-link param or stale state back into history.
- An agent or config file that claims read-only denies the write-capable actions (edit, shell, subagent) at the permission level, not just in its description; a shell allow-list stays read-only.

End with the total findings by severity and which checklist sections were clean.
