export const GOOGLE_CONNECTED_MESSAGE = 'Your Google account is connected. Choose which calendars to show for the household.'

export const GOOGLE_ERRORS = {
  not_configured: 'Google Calendar is not turned on for Home yet. You can still use household events.',
  bad_origin: 'Connect Google from the home site, or from this computer at localhost.',
  sign_in: 'Sign in again, then connect your Google account.',
  denied: 'Google was not connected. You can try again whenever you want.',
  state: 'That connection timed out. Try connecting again.',
  no_refresh: 'Google did not allow Home to keep the connection. Try again and accept the prompt.',
  no_scope: 'Home needs permission to see your calendar list and your events. Connect again and allow that.',
  exchange: 'Could not finish connecting Google. Try again.',
  redirect_uri_mismatch: 'Google did not accept the connection address. Use the home site or localhost.',
  invalid_client: 'Google rejected the app settings. Household events still work here.',
  invalid_grant: 'That connection code expired. Try again.',
  needs_migration: 'The household database needs a one-time calendar update before Google can connect.',
}

export function googleErrorMessage(reason) {
  if (reason && Object.prototype.hasOwnProperty.call(GOOGLE_ERRORS, reason)) return GOOGLE_ERRORS[reason]
  return GOOGLE_ERRORS.exchange
}
