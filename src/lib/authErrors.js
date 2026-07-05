// Maps Supabase Auth errors to a stable "kind" so the UI shows a translated,
// human message (CLAUDE.md §3, §8) instead of the raw English Supabase returns —
// and can pick the right affordance (resend confirmation, switch to sign-in…).
// Supabase surfaces both a machine `code` (newer responses) and a `message`; we
// match on code first, then fall back to message text for older/edge responses.
export function classifyAuthError(err) {
  const code = (err?.code || '').toLowerCase()
  const msg = (err?.message || '').toLowerCase()

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'invalidCredentials'
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'emailNotConfirmed'
  }
  if (
    code === 'user_already_exists' ||
    code === 'email_exists' ||
    msg.includes('already registered') ||
    msg.includes('already been registered') ||
    msg.includes('user already exists')
  ) {
    return 'userExists'
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    msg.includes('rate limit') ||
    msg.includes('too many requests')
  ) {
    return 'rateLimit'
  }
  if (code === 'weak_password' || msg.includes('password should be') || msg.includes('too weak')) {
    return 'weakPassword'
  }
  if (
    code === 'validation_failed' ||
    code === 'email_address_invalid' ||
    msg.includes('unable to validate email') ||
    msg.includes('invalid email')
  ) {
    return 'invalidEmail'
  }
  // Recovery/updateUser without a valid session — usually an expired reset link.
  if (msg.includes('session') && msg.includes('missing')) {
    return 'sessionMissing'
  }
  return 'generic'
}

// i18n key for a given error kind. Every kind is translated in en/ru; the other
// 11 locales fall back through i18next (CLAUDE.md §8).
export function authErrorMessageKey(kind) {
  const map = {
    invalidCredentials: 'auth.errors.invalidCredentials',
    emailNotConfirmed: 'auth.errors.emailNotConfirmed',
    userExists: 'auth.errors.userExists',
    rateLimit: 'auth.errors.rateLimit',
    weakPassword: 'auth.errors.weakPassword',
    invalidEmail: 'auth.errors.invalidEmail',
    sessionMissing: 'auth.errors.sessionMissing',
  }
  return map[kind] || 'auth.genericError'
}
