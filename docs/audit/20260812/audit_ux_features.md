# UX and Product Completeness Audit

## Original Audit Prompt

> Act as a Principal Product Architect and UX Specialist. Analyze this codebase with a focus on product completeness, user experience, and feature gaps.
>
> Specifically, evaluate:
>
> 1. Feature Gaps & Edge Cases: Missing essential features, user flows, or handling of edge cases (e.g., loading states, error boundaries, empty states, offline/reconnection).
> 2. UX & Component Interaction: Review component structure, navigation, state transitions, API state handling, and friction points.
> 3. Accessibility & UX Best Practices: ARIA patterns, keyboard navigation, and design system consistency.
>
> Output Requirement:
> Write your complete findings directly to a markdown file named `audit_ux_features.md` in the root directory. Include a prioritized summary categorized by Critical UX Fixes, Feature Enhancements, and DX Quick Wins.

## Scope

Review covered React routes and feature components, Supabase hooks, realtime subscriptions, database policies and migrations, push notifications, PWA behavior, tests, and product documentation.

Primary user journey:

`sign in -> lobby -> create or join channel -> configure character -> read and write messages -> roll dice -> manage members and notifications -> archive or return to lobby`

## Executive Summary

RoleByPost has a strong feature baseline for asynchronous tabletop play: channel-based campaigns, realtime chat, whispers, NPCs, dice, replies, reactions, safety tools, push notifications, search, exports, and in-app help. Core product value is clear.

Release readiness is limited by four classes of issues:

- Trust and data integrity: authorization invariants are not enforced consistently at the database boundary.
- Resilience: realtime recovery, offline behavior, retry flows, and partial mutation handling are incomplete.
- Interaction quality: several loading, error, empty, modal, and mobile states lose user context or block keyboard and touch users.
- Product lifecycle gaps: channel ownership, invitation, archival, notification history, and large-history workflows are incomplete.

## Prioritized Summary

### Critical UX Fixes

1. **P0 - Protect account roles and channel membership invariants.** A profile self-update can include `server_admin`, and a member self-update is not constrained to its original `channel_id`. A client can therefore reach unauthorized product states. Enforce immutable role, `user_id`, and `channel_id` fields through RLS, triggers, or tightly scoped RPCs. Evidence: `supabase/migrations/20240801000000_init_schema.sql:20-21,102-106`, `supabase/migrations/20260810160204_server_admin.sql:1-5`.

2. **P0 - Make blocking actually revoke access.** The UI hides blocked members, but `is_channel_member()` only checks membership existence. Blocked users can continue reading and writing channel data, and no unblock action exists. Blocking must revoke route access, message reads and writes, realtime visibility, and push delivery; show the blocked user a clear removal state. Evidence: `src/features/channels/MemberList.tsx:50-73,149-150`, `supabase/migrations/20260801101940_fix_rls_recursion.sql:3-13,65-80`.

3. **P0 - Stop trusting client-supplied push events.** The push function accepts arbitrary records, has `verify_jwt = false`, and uses a service-role client to resolve recipients and content. A caller can spoof message or turn events and target other users. Derive event data from trusted database events or verify JWT, sender membership, channel permissions, recipient rules, and record identity server-side. Evidence: `supabase/config.toml:13-19`, `supabase/functions/push-notifications/index.ts:24-37,44-85`, `src/features/chat/useMessages.ts:234-237`.

4. **P0 - Restrict sensitive channel fields.** Regular channel reads expose invite codes and GM-only resource URLs; the UI only hides GM resources after retrieval. Return join previews through a safe projection or RPC and keep invite tokens and GM-only URLs behind role-checked access. Evidence: `src/features/channels/JoinChannel.tsx:33-37`, `src/features/channels/ChannelView.tsx:220-228`, `supabase/migrations/20260808141428_private_channels_only.sql:23-29`.

5. **P0 - Lock message updates to intended fields.** The message update policy checks sender and deletion state but does not protect channel, type, recipient, sender, or other fields in the new row. This can corrupt message routing and privacy. Use immutable-column checks and separate scoped update operations for content, edit state, and deletion. Evidence: `supabase/migrations/20260808121758_fix_message_edit_delete.sql:17-45`.

6. **P0 - Make channel creation and settings atomic.** Creation writes the channel, optional secret, and membership through separate operations. Settings separately writes channel data, safety tools, and password state. Failures leave orphan channels, missing secrets, or partial settings while the UI reports only a generic failure. Use transactional RPCs, or explicitly show partial-save recovery. Evidence: `src/features/channels/CreateChannelModal.tsx:35-95`, `src/features/channels/ChannelSettings.tsx:79-135`.

7. **P0 - Make dice results authoritative and consistent.** Rolls use browser `Math.random()`, then insert a message and roll record separately. Any member can submit arbitrary roll metadata, and a failed second insert leaves a visible roll without history. Move roll calculation and both inserts into one server-side operation, or clearly label client-authoritative rolls if that is an intentional product decision. Evidence: `src/features/dice/parser.ts:61-63`, `src/features/chat/useMessages.ts:271-313`, `supabase/migrations/20240801000000_init_schema.sql:192-205`.

8. **P1 - Add realtime reconnect and resynchronization.** Subscriptions do not inspect status, retry, or refetch after disconnect. Initial message fetch and subscription start concurrently, and inserts append without ID deduplication. Members subscribe only to updates, so joins and removals can remain stale. Add connection status, deterministic initial sync, ID-based reconciliation, and refetch after reconnect. Evidence: `src/features/chat/useMessages.ts:93-177,198-203`, `src/features/channels/useChannel.ts:71-99`.

9. **P1 - Preserve user context on data errors.** Channel errors redirect silently to the lobby, while message errors can render the same `No messages yet` state as a successful empty channel. Unread state is marked before message history finishes loading. Distinguish empty, unavailable, unauthorized, archived, and deleted states; preserve stale content; provide Retry; mark read only after successful display. Evidence: `src/features/channels/ChannelView.tsx:76-89,130-133`, `src/features/chat/MessageList.tsx:37-43`, `src/features/channels/useChannel.ts:49-59`.

10. **P1 - Add offline and render recovery behavior.** The service worker precaches assets only. There is no online indicator, reconnect banner, cached history, queued draft/send behavior, retry policy, or root error boundary. A transient network failure can look like lost content, and an uncaught render error can blank the application. Evidence: `src/sw.ts:6-27`, `src/main.tsx:7-13`.

11. **P1 - Fix broken route and invite error states.** There is no catch-all route, so unknown URLs render no useful page. Invite fetch errors are suppressed when a code exists, leaving an incomplete form that may still imply a valid invite. Add Not Found, invalid invite, expired invite, archived channel, and access-denied states with recovery actions. Evidence: `src/App.tsx:141-153`, `src/features/channels/JoinChannel.tsx:29-48,100-122`.

12. **P1 - Clarify archived-channel behavior.** Archiving removes a channel from the lobby but does not clearly make it read-only, and the join RPC does not reject archived channels. Define archive semantics: existing members should see an archived/read-only state, new joins should be rejected, and restore should be clearly available to the GM. Evidence: `src/features/channels/ChannelSettings.tsx:178-199`, `src/features/channels/ArchivedChannels.tsx:40-53`, `supabase/migrations/20260810190001_join_channel_dynamic_cap.sql:28-73`.

13. **P1 - Fix dice check failure path.** When a character lacks an ability modifier, the warning is appended to the notation passed to `parseAndRoll`, which rejects the notation. Keep explanatory text separate from parser input and validate prompt input before sending. Evidence: `src/features/chat/MessageItem.tsx:133-160`, `src/features/dice/parser.ts:27-37`.

14. **P1 - Fix deleted-message privacy and history behavior.** Search and export queries do not exclude soft-deleted messages, so deleted content can reappear outside the channel timeline. Filter deleted rows and define whether deleted replies, search results, exports, and notifications show only a deletion marker. Evidence: `src/features/search/useSearch.ts:33-39`, `src/features/channels/ChannelSettings.tsx:142-159`, `src/features/chat/MessageItem.tsx:399-401`.

15. **P1 - Surface mutation failures instead of logging them.** Reaction failures are only logged, active-player update failures are only logged, and push trigger failures are detached from the send result. The user can see stale state while believing an action succeeded. Add per-action pending state, actionable errors, and rollback or retry behavior. Evidence: `src/features/channels/ChannelView.tsx:63-73`, `src/features/chat/useMessages.ts:239-267,333-347`.

16. **P1 - Treat profile loading as auth readiness.** Profile query errors are ignored during initial session restoration, and `ProfileSettings` renders nothing when profile data is absent. Sign-in errors also have no visible error path. Preserve prior profile data during transient failures and show retry or sign-in recovery states. Evidence: `src/features/auth/AuthContext.tsx:40-58,63-88`, `src/features/auth/LoginPage.tsx:76-82`, `src/features/auth/ProfileSettings.tsx:68-70`.

17. **P1 - Make active-player selection match the product promise.** Documentation promises active player(s), but the composer stores and submits only one selected member. Use a multi-select interaction, show current active players consistently, and define notification behavior when multiple players are selected. Evidence: `docs/FEATURES.md:33-39`, `src/features/chat/MessageComposer.tsx:267-288`.

18. **P1 - Repair modal keyboard behavior.** Most modals use `aria-modal` without focus trapping, initial focus, focus restoration, or consistent Escape handling. Users can tab into the background and lose their position. Adopt one shared dialog primitive or native `<dialog>` behavior. Evidence: `src/features/channels/CreateChannelModal.tsx:100-107`, `src/features/channels/ChannelSettings.tsx:201-210`, `src/features/dice/RollHistoryModal.tsx:68-74`, `src/features/notifications/ChannelNotificationSettingsModal.tsx:22-40`.

19. **P1 - Remove invalid nested interactive patterns.** Full-screen backdrops use `role="button"` while containing dialogs or buttons, and the lobby create control wraps a button inside another keyboard-interactive element. This causes duplicate activation and ambiguous screen-reader semantics. Use a non-interactive backdrop plus explicit close controls and a single native button. Evidence: `src/features/channels/SafetyToolsModal.tsx:14-32`, `src/features/help/ChannelHelpModal.tsx:25-43`, `src/features/notifications/ChannelNotificationSettingsModal.tsx:22-40`, `src/features/channels/Lobby.tsx:116-143`.

20. **P1 - Make message actions available on touch and keyboard.** Regular message actions are hidden with `opacity-0` and revealed only by hover. They are difficult or impossible to discover on touch devices and are not revealed by keyboard focus. Keep them visible on touch, use `focus-within`, or provide an accessible overflow menu. Evidence: `src/features/chat/MessageItem.tsx:443-474`.

### Feature Enhancements

1. **P1 - Paginate chat history.** `useMessages` loads the entire channel history, which increases initial latency and memory use as campaigns grow. Add cursor pagination, load-older behavior, preserved scroll position, and a clear loading boundary. Evidence: `src/features/chat/useMessages.ts:93-105`.

2. **P1 - Complete large-history exports.** Export is capped at 5,000 messages and tells users batch export is coming later. Implement cursor-based export with progress, cancellation, and a complete-result guarantee. Evidence: `src/features/channels/ChannelSettings.tsx:138-153`.

3. **P1 - Add channel lifecycle controls.** Missing flows include invite regeneration/revocation, channel deletion, GM transfer or co-GM, unblock, and a clear member-facing archive state. These are necessary for campaigns that change ownership or need access cleanup. Evidence: `src/features/channels/ChannelSettings.tsx:178-199`, `src/features/channels/MemberList.tsx:305-333`.

4. **P1 - Add lobby and member realtime updates.** Lobby data is fetched once, and member subscriptions handle updates but not inserts or deletes. New joins, kicks, and leaves require refresh or local navigation to become visible. Evidence: `src/features/channels/useChannels.ts:29-96`, `src/features/channels/useChannel.ts:71-93`.

5. **P1 - Replace unread count N+1 queries.** The lobby performs one message count query per channel and ignores count failures. Use the existing `get_unread_count` RPC or one aggregated query, and distinguish an unknown count from zero. Evidence: `src/features/channels/useChannels.ts:47-79`, `supabase/migrations/20260801195300_add_unread_count_rpc.sql:1-14`.

6. **P1 - Add notification history and email support.** `email_enabled` exists in the schema but there is no email delivery, in-app notification center, notification history, or read/unread management. Define channel, mention, whisper, and turn notification retention and delivery rules. Evidence: `supabase/migrations/20240801000000_init_schema.sql:209-235`, `src/features/auth/ProfileSettings.tsx:196-231`.

7. **P2 - Add attachments and campaign assets.** Campaign resources are external URLs only, and chat supports text or remote Markdown images. Add controlled uploads, size/type validation, previews, and storage permissions if campaign files are part of the product promise. Evidence: `docs/FEATURES.md:28-30`, `src/features/channels/ChannelSettings.tsx:310-344`.

8. **P2 - Improve search scalability and relevance.** Search is limited to 20 results, uses English-only full-text search, and has no pagination or filters for author, date, message type, whisper, or NPC. Add result pagination and filters before campaigns become difficult to navigate. Evidence: `src/features/search/useSearch.ts:33-39`.

9. **P2 - Resolve mention ambiguity.** Mentions autocomplete by character-name prefix and mention linking is case-sensitive. Duplicate character names can notify the wrong user or make identity unclear. Use stable member IDs in the composer representation and display disambiguating profile information. Evidence: `src/features/chat/MessageComposer.tsx:69-103`, `src/features/chat/mentions.ts:15-36`.

10. **P2 - Reconcile push subscription state.** Browser subscription removal happens before database deletion is confirmed, and server records are not proactively reconciled when a browser revokes permission. Show subscription status and retry failed reconciliation. Evidence: `src/features/auth/usePushNotifications.ts:133-150`.

11. **P2 - Persist notification-banner dismissal.** Dismissal is component-local and returns after navigation or reload. Store dismissal preference with a reset path so the banner is helpful without becoming repetitive. Evidence: `src/features/notifications/PermissionBanner.tsx:8-13,47-54`.

12. **P2 - Refresh profile state after save.** Profile settings writes successfully but the auth context keeps the old profile until a later reload or auth event. Update context state immediately so navigation, initials, and role-dependent UI stay consistent. Evidence: `src/features/auth/ProfileSettings.tsx:32-52`, `src/features/auth/AuthContext.tsx:24-25`.

### DX Quick Wins

1. **P1 - Add database authorization tests.** Existing component tests largely mock Supabase chains. Add migration-level or local Supabase tests covering role escalation, membership moves, blocked users, message field tampering, whisper visibility, archived joins, and push authorization.

2. **P1 - Add one end-to-end happy-path test.** Cover sign-in restoration, channel creation, join, message send, realtime receipt, dice roll, unread clearing, and return to lobby. This catches state-transition regressions that isolated component tests miss.

3. **P1 - Add accessibility regression checks.** Test dialog focus, Escape, focus return, labels, keyboard mention selection, keyboard sortable headers, mobile sidebar controls, and message action visibility. Use existing Testing Library infrastructure before adding a new test framework.

4. **P2 - Remove trust-boundary `any` types.** Join attributes, channel updates, composer payloads, message formatting, renderer props, and roll breakdowns use weak typing. Define narrow payload types at Supabase boundaries to make invalid state harder to create. Evidence: `src/features/channels/JoinChannel.tsx:24-25,89-95`, `src/features/channels/ChannelSettings.tsx:83-91`, `src/features/chat/MessageComposer.tsx:124-135`, `src/features/chat/useMessages.ts:23-29`.

5. **P2 - Centralize async state conventions.** Loading, saving, errors, retry labels, and toast behavior vary by feature. A small shared pattern should preserve stale data, expose retry, disable only the affected action, and announce status accessibly. Avoid replacing every feature with a generic data framework unless scale requires it.

6. **P2 - Centralize dialogs and confirmations.** Browser `alert`, `confirm`, and `prompt` create inconsistent styling, keyboard behavior, and testability. Replace them with one accessible confirmation/input primitive. Evidence: `src/features/auth/ProfileSettings.tsx:55-65`, `src/features/channels/MemberList.tsx:57-58,82-83,102-105,132-135`, `src/features/chat/MessageItem.tsx:86-97,143-151`.

7. **P2 - Add consistent accessible status patterns.** Spinners are visual-only and lack `role="status"` or `aria-busy`. Add status text and error association to ProtectedRoute, Lobby, ChannelView, SearchModal, JoinChannel, and AdminView. Evidence: `src/components/ProtectedRoute.tsx:9-13`, `src/features/channels/Lobby.tsx:45-49`, `src/features/channels/ChannelView.tsx:76-81`, `src/features/search/SearchModal.tsx:76-79`.

8. **P2 - Fix form and heading semantics.** Add `aria-invalid`, `aria-describedby`, live error regions, and first-error focus. Use `<h1>` for page titles instead of beginning several pages at `<h2>`. Evidence: `src/features/channels/CreateChannelModal.tsx:188-191`, `src/features/channels/JoinChannel.tsx:213-216`, `src/features/auth/LoginPage.tsx:89-94`, `src/features/auth/ProfileSettings.tsx:73-76`.

9. **P2 - Make all controls keyboard-operable.** Add labels to lobby and search inputs, dice quantity/type/modifier controls, icon-only buttons, and archived-channel navigation. Replace clickable `<th>` elements with native buttons while retaining `aria-sort`. Evidence: `src/App.tsx:44-58`, `src/features/search/SearchModal.tsx:58-71`, `src/features/dice/DiceRoller.tsx:50-95`, `src/features/admin/AdminView.tsx:57-73`.

10. **P2 - Restore visible focus styling.** Several controls use `focus:outline-none` without a replacement focus ring. Establish a shared `focus-visible` style and remove bare outline suppression. Evidence: `src/App.tsx:61-70`, `src/features/channels/MemberList.tsx:235-244`, `src/features/chat/MessageComposer.tsx:205-218`, `src/contexts/ToastContext.tsx:84-93`.

11. **P2 - Improve chat log behavior.** Give the message region an accessible name and `role="log"`, announce new messages politely, avoid forced scroll when the user is reading history, and honor reduced-motion preferences. Evidence: `src/features/chat/MessageList.tsx:30-35,45-98`.

12. **P2 - Expose mobile sidebar state.** Add `aria-expanded`, `aria-controls`, a stable sidebar ID, and an accessible close label. Make backdrop close behavior separate from dialog/button semantics. Evidence: `src/features/channels/ChannelView.tsx:109-119,182-208`.

13. **P2 - Update documentation drift.** `docs/SCHEMA.md` does not reflect later schema additions such as server admin, NPCs, safety tools, AFK, and channel notification settings. Keep `docs/FEATURES.md`, help content, screenshots, and schema documentation aligned with shipped behavior. Evidence: `docs/SCHEMA.md:17-80`, `supabase/migrations/20260810160204_server_admin.sql:1-5`, `supabase/migrations/20260810172633_channel_npcs.sql:7-32`.

## Recommended Delivery Order

1. Close authorization and privacy blockers before adding new user-facing features.
2. Add transaction boundaries and realtime resync so user-visible state becomes trustworthy.
3. Ship explicit loading, empty, error, retry, offline, and archived states.
4. Replace modal and control interaction patterns with accessible primitives.
5. Add pagination, lifecycle management, notification history, and large-export support.
6. Add database, end-to-end, and accessibility regression coverage.

## Definition of Product Readiness

- Unauthorized users cannot alter roles, move memberships, bypass blocks, read private fields, or tamper with message routing.
- Every network-backed screen distinguishes loading, success-empty, error, unauthorized, and retry states.
- Realtime disconnects are visible and recover without duplicate or missing messages.
- Mutations are atomic or expose clear pending, partial, failed, and retry states.
- All dialogs, forms, menus, tables, chat actions, and mobile navigation work with keyboard, screen reader, and touch input.
- Large campaigns remain usable through paginated history, complete exports, searchable content, and reliable unread state.
