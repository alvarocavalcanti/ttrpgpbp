// Version of the Terms of Service / Privacy Policy the user accepts.
// Stamped into profiles.terms_version by confirm_terms(). Bump on every
// terms or privacy edit: signed-in users whose stored version is behind are
// gated by ReConsentGate until they re-accept.
export const CURRENT_TERMS_VERSION = '2026-09-24'

// localStorage key recording which terms version this device's sign-in
// checkbox explicitly agreed to. AuthContext only stamps an acceptance when
// this matches CURRENT_TERMS_VERSION — a bump leaves it behind, so a new
// version is never accepted on load without fresh checkbox evidence.
export const TERMS_AGREED_KEY = 'terms-agreed-version'
