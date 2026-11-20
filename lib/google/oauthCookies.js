import {
  OAUTH_NEXT_COOKIE,
  OAUTH_ORIGIN_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_USER_COOKIE,
} from './constants.js'

export function oauthCookieOptions(secure) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  }
}

export function clearOauthCookies(response) {
  const expired = { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 }
  response.cookies.set(OAUTH_STATE_COOKIE, '', expired)
  response.cookies.set(OAUTH_ORIGIN_COOKIE, '', expired)
  response.cookies.set(OAUTH_USER_COOKIE, '', expired)
  response.cookies.set(OAUTH_NEXT_COOKIE, '', expired)
  return response
}
