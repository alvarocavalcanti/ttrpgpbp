# Database Schema & Security

## Schema Overview

### `profiles`

Extends Supabase `auth.users`. Created automatically on first sign-in.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | FK to `auth.users.id` |
| `display_name` | text | From Google account |
| `email` | text | From Google account |
| `avatar_url` | text, nullable | From Google account or custom |
| `created_at` | timestamptz | Default `now()` |

### `channels`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `name` | text | |
| `avatar_url` | text, nullable | Public URL of the uploaded channel avatar (path `{channel_id}/avatar/*.jpg` in the `images` storage bucket) |
| `gm_id` | UUID, FK → profiles, nullable | Creator, channel owner. Nullable + `ON DELETE SET NULL`: deleting a GM's account **orphans** the channel (chat history survives). Server admins reclaim orphans via `admin_claim_channel`. |
| `is_archived` | boolean | Default `false`. True = hidden from main lobby, read-only/hidden |
| `invite_code` | text, unique | For invite link sharing |
| `map_url` | text, nullable | External link |
| `resources_url` | text, nullable | External link |
| `status_text` | text, nullable | Free-form markdown (initiative, timers, etc.) |
| `last_message_at` | timestamptz, nullable | Set on message insert via trigger; used for lobby ordering |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `channel_secrets`

GM-only (RLS) table holding channel access-password material and the GM-only
resources URL. The hash is derived client-side (PBKDF2-SHA256, 210k
iterations); `get_channel_salt(channel_id)` exposes the salt to joining users
so they can re-derive the expected hash. `get_join_channel_preview(channel_id)`
returns a safe projection (name, game_system, has_password) for the join form.

| Column | Type | Notes |
|---|---|---|
| `channel_id` | UUID, PK, FK → channels | |
| `password_hash` | text, nullable | Null = no password required |
| `password_salt` | text, nullable | PBKDF2 salt (hex). Null on legacy pre-salt channels |
| `gm_only_resources_url` | text, nullable | GM-only link, never visible to members |

### `channel_members`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `channel_id` | UUID, FK → channels | |
| `user_id` | UUID, FK → profiles | |
| `character_name` | text | |
| `character_avatar_url` | text, nullable | |
| `character_notes` | text, nullable | Plain-text notes (no markdown), shown in the member list |
| `character_sheet_url` | text, nullable | |
| `is_active_player` | boolean | Default `false`. Multiple can be active. |
| `is_blocked` | boolean | Default `false`. Blocked members lose channel access (`is_channel_member()` excludes them) and can be unblocked by the GM. (Kick deletes the row) |
| `joined_at` | timestamptz | |

**Constraints:** Unique constraint on (`channel_id`, `user_id`)

### `messages`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `channel_id` | UUID, FK → channels | |
| `sender_id` | UUID, FK → profiles | `ON DELETE SET NULL` — when a user deletes their account, their messages stay but the author is anonymized |
| `type` | text | `regular`, `scene`, `dice_roll`, `system` |
| `content` | text | Markdown content |
| `whisper_to` | UUID, FK → profiles, nullable | If set: visible only to sender + this user + GM |
| `reply_to` | UUID, FK → messages, nullable | The message this one replies to (must be in the same channel) |
| `npc_name` / `npc_avatar_url` | text, nullable | Snapshot of the NPC identity for `npc` messages |
| `roll_dc` / `roll_success` | integer / boolean, nullable | Called-out DC check target + outcome (meets beats) |
| `mention_user_ids` | uuid[], nullable | Canonical mention recipients, resolved + validated server-side |
| `client_request_id` | UUID, nullable | Idempotency key (sender + channel unique): a command replay returns the existing row instead of duplicating |
| `is_edited` | boolean | Default `false` |
| `is_deleted` | boolean | Default `false`. Soft delete — content replaced in UI. |
| `search_vector` | tsvector | Generated column for full-text search |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### `dice_rolls`

Linked to a `dice_roll`-type message. Stores structured data for roll history queries.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `message_id` | UUID, FK → messages | |
| `channel_id` | UUID, FK → channels | Denormalized for easier history queries |
| `roller_id` | UUID, FK → profiles | Who clicked / rolled |
| `notation` | text | e.g., `2d20kh1`, `d6+3` |
| `result` | integer | Final computed result |
| `breakdown` | jsonb | e.g., `{"rolls": [18, 7], "kept": [18], "modifier": 4}` |
| `created_at` | timestamptz | |

### `notification_preferences`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID, PK | |
| `user_id` | UUID, FK → profiles, unique | One row per user |
| `push_enabled` | boolean | Default `true` |
| `badge_enabled` | boolean | Default `true` |
| `email_enabled` | boolean | Default `false` |

---

## Row-Level Security (RLS) Policies

Automatic RLS is enabled for all tables, defaulting to deny-all. The following policies control access:

- **profiles**: Any authenticated user can read. Users can only update their own row.
- **channels**: Public channels readable by anyone. Non-public channels readable only by their members (`channel_members`).
- **channel_members**: Readable by members of the same channel. GM can insert, update, and delete. Users can update their own row (character name, avatar, sheet URL).
- **messages**: Readable by channel members, **with a filter**: if `whisper_to` is set, the row is only visible to `sender_id`, `whisper_to`, and the channel's `gm_id`. Senders can update their own messages (enforcing the 15-min window). Senders can soft-delete their own messages. **Direct inserts are restricted**: the client no longer writes `messages` directly — every message goes through a SECURITY DEFINER command (`send_message` / `roll_dice` / `moderate_member` / `join_channel`). The INSERT policy is a defense-in-depth backstop: it rejects archived channels, non-member senders, non-GM scene/NPC types, cross-channel reply targets, and non-member whisper targets.
- **dice_rolls**: Readable by channel members. **Insert is revoked from clients** — rolls are only created by the `roll_dice` command, so a fabricated result can never be persisted. Realtime INSERT events are published (`ALTER PUBLICATION`), and the roll history RPC excludes rolls from soft-deleted messages.
- **notification_preferences**: Users can only read/write their own row.
- **storage.objects (`images` bucket)**: Public bucket (plain public URLs for avatars). Reads are public; writes (INSERT/UPDATE/DELETE) are restricted to the GM of the channel named by the object path's first segment (`is_channel_gm(storage.foldername(name)[1]::uuid)`). Object paths are `{channel_id}/{avatar|message|map|resources|npc}/{uuid}.jpg`.

### `app_settings`

| Key | Type | Default | Notes |
|---|---|---|---|
| `max_channels_per_user` | number | 10 | Channel cap for non-admin users |
| `image_uploading_enabled` | boolean | `false` | Master toggle for image uploads; off keeps the server near zero cost |
| `image_max_size_mb` | number | 5 | Max upload size before client-side resize |
| `image_retention_days` | number | 0 | `0` keeps images forever; otherwise the `cleanup-images` edge function deletes images older than this many days |

### Admin / data-lifecycle functions

- **`admin_claim_channel(channel_id)`** (SECURITY DEFINER, server admin only): sets `channels.gm_id` to the caller for an orphaned (`gm_id IS NULL`) channel — no-op otherwise. Lets admins reclaim channels left behind by deleted GMs.
- **`delete-account` edge function**: verifies the caller's JWT, rejects the sole server admin (would leave the app headless), then calls `auth.admin.deleteUser`. Cascades erase the user's profiles, memberships, dice rolls, reactions, preferences, and push subscriptions; their sent messages are anonymized (`sender_id SET NULL`) and whispers addressed to them are deleted (`whisper_to CASCADE`).
- **`cleanup-images` edge function**: scheduled daily through a trusted server
  caller carrying `CLEANUP_IMAGES_SECRET`; deletes `images` bucket objects older
  than `app_settings.image_retention_days` (no-op while 0). Each deletion batch
  is recorded in `image_cleanup_audit`.

### `image_cleanup_audit`

Internal service-role audit table. Browser clients have no access.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint, identity | Batch audit ID |
| `run_id` | UUID | Groups batches from one cleanup run |
| `retention_days` | integer | Retention configuration used |
| `cutoff_at` | timestamptz | Deletion cutoff |
| `object_paths` | text[] | Objects in batch, maximum 500 |
| `status` | text | `pending`, `deleted`, or `failed` |
| `error_message` | text, nullable | Failure detail when status is `failed` |
| `created_at` / `completed_at` | timestamptz | Batch lifecycle timestamps |

### Command RPCs (backend-authoritative mutations)

All commands are SECURITY DEFINER with `search_path = public`, derive the caller from `auth.uid()`, validate channel membership and permissions, enforce content/field limits, and commit their writes in a single transaction. They return the canonical persisted rows.

| Function | Purpose | Enforces |
|---|---|---|
| `send_message` | Create a `regular`/`scene`/`npc` message (+ optional active-player flip) | membership, archived, type authz (scene/NPC GM-only), content length, reply target same channel, whisper target is member, mention resolution + `@all` GM-only, NPC roster snapshot, idempotency |
| `roll_dice` | Roll dice and persist the message + `dice_rolls` row atomically | notation regex, dice/sides limits, modifier clamped to game-system bounds, DC success (meets beats), archived, membership, reply target, idempotency |
| `moderate_member` | Block / unblock / kick / leave + system message | GM-only (block/unblock/kick), self-only (leave), GM is never removable |
| `update_channel_settings` | Save `channels` + `channel_secrets` + `channel_safety_tools` in one transaction | GM-only, field sanitization |
| `join_channel` | Join + attributes + join system message | password/invite, archived, channel cap, attribute bounds |
| `get_channel_roll_history` | Read-only roll history (excluding rolls from soft-deleted messages) | member-only via RLS |

---

## Full-Text Search Setup

A generated `tsvector` column on `messages` enables fast, free full-text search via PostgreSQL:

```sql
ALTER TABLE messages
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX messages_search_idx ON messages USING GIN (search_vector);
```

---

## Design Notes

1. **Soft deletes on messages**: The `is_deleted` flag means the row stays for referential integrity (dice rolls linked to it), but the UI shows "This message was deleted."
2. **`dice_roll` message type**: Rolling happens through the `roll_dice` command, which writes the `messages` row (type `dice_roll`, content = formatted breakdown) and the `dice_rolls` row (structured data) in one transaction. The message appears in the timeline; the `dice_rolls` table powers the roll history view.
3. **`system` message type**: For events like "Player joined the channel" or "GM updated the scene." Generated by the backend commands (`join_channel`, `moderate_member`), never by clients.
4. **15-minute edit window**: Enforced via a Supabase database function or RLS policy that checks `now() - created_at < interval '15 minutes'`.
5. **The GM is a channel_member**: The GM gets a row in `channel_members` like everyone else. The `gm_id` on the channel identifies them for permission checks.
6. **Migrations**: Schema changes live as timestamped SQL files in `supabase/migrations/`. PR CI validates all migrations apply cleanly from scratch (`supabase db reset`); merging to main pushes them to the remote project. Migration files are immutable once merged — fix issues with a new migration, never an edit.
