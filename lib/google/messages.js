export const PRODUCTION_ORIGIN = 'https://home-dashboard-ebon.vercel.app'
export const LOCAL_ORIGIN = 'http://localhost:3000'
export const ALLOWED_OAUTH_ORIGINS = [PRODUCTION_ORIGIN, LOCAL_ORIGIN]

export const GOOGLE_CONNECTED_MESSAGE = 'Google Calendar connected. New changes here are saved to the shared calendar.'

export const GOOGLE_ERRORS = {
  not_configured: 'Google Calendar is not set up on the server yet.',
  bad_origin: 'Connect Google Calendar from the main site or from http://localhost:3000.',
  sign_in: 'Sign in again, then connect Google Calendar.',
  denied: 'Google Calendar was not connected.',
  state: 'That Google connection expired. Try connecting again.',
  no_refresh: 'Google did not allow offline access. Try connecting again and accept the prompt.',
  no_scope: 'Calendar access was not allowed. Connect again and allow Google Calendar events.',
  exchange: 'Could not finish connecting Google Calendar. Try again.',
  redirect_uri_mismatch: 'Google rejected the redirect address. Connect from the main site or http://localhost:3000.',
  invalid_client: 'The Google client id or secret was rejected. Check the server settings.',
  invalid_grant: 'That Google connection code expired. Try again.',
  needs_migration: 'Run the Google Calendar database migration in Supabase, then connect again.',
}

export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
export const GOOGLE_SCOPES = ['openid', 'email', CALENDAR_SCOPE].join(' ')

export const OAUTH_STATE_COOKIE = 'gcal_oauth_state'
export const OAUTH_ORIGIN_COOKIE = 'gcal_oauth_origin'
