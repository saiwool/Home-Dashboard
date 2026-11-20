import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { allowedOrigin, missingGoogleEnv } from '@/lib/google/config'
import {
  ALLOWED_OAUTH_ORIGINS,
  OAUTH_NEXT_COOKIE,
  OAUTH_ORIGIN_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_USER_COOKIE,
  nextPath,
  safeNext,
} from '@/lib/google/constants'
import {
  emailFromAccessToken,
  emailFromIdToken,
  exchangeAuthCode,
  saveConnection,
} from '@/lib/google/client'
import { GoogleApiError } from '@/lib/google/errors'
import { requireUser } from '@/lib/google/http'
import { GOOGLE_ERRORS } from '@/lib/google/messages'
import { clearOauthCookies } from '@/lib/google/oauthCookies'
import { hasRequiredScopes } from '@/lib/google/scopes'
import { refreshCalendarsForUser } from '@/lib/google/sync'

export const runtime = 'nodejs'

function same(left, right) {
  if (!left || !right) return false
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function finish(request, { connected = false, reason } = {}) {
  const next = safeNext(request.cookies.get(OAUTH_NEXT_COOKIE)?.value)
  const url = new URL(nextPath(next), request.nextUrl.origin)
  if (connected) {
    url.searchParams.set('google', 'connected')
  } else {
    const known = reason && Object.prototype.hasOwnProperty.call(GOOGLE_ERRORS, reason) ? reason : 'exchange'
    url.searchParams.set('google', 'error')
    url.searchParams.set('reason', known)
  }
  return clearOauthCookies(NextResponse.redirect(url))
}

export async function GET(request) {
  if (missingGoogleEnv().length) return finish(request, { reason: 'not_configured' })

  const { user } = await requireUser()
  if (!user) return finish(request, { reason: 'sign_in' })

  const oauthError = request.nextUrl.searchParams.get('error')
  if (oauthError) return finish(request, { reason: 'denied' })

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expected = request.cookies.get(OAUTH_STATE_COOKIE)?.value
  const expectedUser = request.cookies.get(OAUTH_USER_COOKIE)?.value
  if (!code || !same(state, expected) || !same(expectedUser, user.id)) {
    return finish(request, { reason: 'state' })
  }

  const originCookie = request.cookies.get(OAUTH_ORIGIN_COOKIE)?.value
  const origin = ALLOWED_OAUTH_ORIGINS.includes(originCookie) ? originCookie : allowedOrigin(request)
  if (!origin) return finish(request, { reason: 'bad_origin' })

  try {
    const token = await exchangeAuthCode(code, `${origin}/api/google/callback`)
    if (!hasRequiredScopes(token.scope)) return finish(request, { reason: 'no_scope' })
    const email = emailFromIdToken(token.id_token) || await emailFromAccessToken(token.access_token)
    await saveConnection({
      userId: user.id,
      email,
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
      expiresIn: token.expires_in,
      scope: token.scope,
    })
    await refreshCalendarsForUser(user.id).catch((error) => {
      console.error('google calendar list', error instanceof GoogleApiError ? error.code : 'failed')
    })
    return finish(request, { connected: true })
  } catch (error) {
    const reason = error instanceof GoogleApiError ? error.code : 'exchange'
    console.error('google oauth callback', reason)
    return finish(request, { reason })
  }
}
