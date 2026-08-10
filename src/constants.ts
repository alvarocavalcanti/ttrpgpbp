// Client-side fallback for the admin-configurable channel cap. The live value
// is read from app_settings (key 'max_channels_per_user', seeded as 10) via
// useAppSetting; this constant is only the default when the setting is absent.
export const MAX_CHANNELS_PER_USER = 10
