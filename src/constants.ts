// Client-side fallback for the admin-configurable channel cap. The live value
// is read from app_settings (key 'max_channels_per_user', seeded as 10) via
// useAppSetting; this constant is only the default when the setting is absent.
export const MAX_CHANNELS_PER_USER = 10

export const MAX_MESSAGE_LENGTH = 4000
export const MAX_ROLL_WARNING_LENGTH = 500
export const MAX_DISPLAY_NAME_LENGTH = 40
export const MAX_CHANNEL_NAME_LENGTH = 80
export const MAX_URL_LENGTH = 500
export const MAX_STATUS_LENGTH = 2000
export const MAX_SAFETY_TEXT_LENGTH = 2000
export const MAX_AWAY_MESSAGE_LENGTH = 200
export const MAX_ADMIN_SUSPEND_REASON_LENGTH = 200
export const MAX_NPC_NAME_LENGTH = 40

// Rooms (sub-channels) per channel (#621). create_sub_channel enforces the same
// hardcoded cap server-side; this mirrors it for client-side validation copy.
export const MAX_ROOMS_PER_CHANNEL = 10
export const MAX_ROOM_NAME_LENGTH = 40
