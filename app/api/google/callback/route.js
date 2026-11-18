import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { allowedOrigin, missingGoogleEnv } from '@/lib/google/config'
import {
  emailFromAccessToken,
  emailFromIdToken,
  exchangeAuthCode,
  hasCalendarScope,
  saveConnection,
} from '@/lib/google/client'
import { GoogleApiError } from '@/lib/google/errors'
import { requireUser } from '@/lib/google/http'
import { ALLOWED_OAUTH_ORIGINS, GOOGLE_ERRORS, OAUTH_ORIGIN_COOKIE, OAUTH_STATE_COOKIE } from '@/lib/google/messages'
import { clearOauthCookies } from '@/lib/google/oauthCookies'

export const runtime = 'nodejs'

function statesMatch(left, right) {
  if (!left || !right) return false
  const a = Buffer.from(String(left))
  const b = Buffer.from(String(right))
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function finish(request, { connected = false, reason } = {}) {
  const url = new URL('/dashboard/calendar', request.nextUrl.origin)
  if (connected) {
    url.searchParams.set('google', 'connected')
  } else {
    url.searchParams.set('google', 'error')
    url.searchParams.set('reason', GOOGLE_ERRORS[reason] ? reason : 'exchange')
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
  if (!code || !statesMatch(state, expected)) return finish(request, { reason: 'state' })

  const originCookie = request.cookies.get(OAUTH_ORIGIN_COOKIE)?.value
  const origin = ALLOWED_OAUTH_ORIGINS.includes(originCookie) ? originCookie : allowedOrigin(request)
  if (!origin) return finish(request, { reason: 'bad_origin' })

  try {
    const token = await exchangeAuthCode(code, `${origin}/api/google/callback`)
    if (!token.refresh_token) return finish(request, { reason: 'no_refresh' })
    if (!hasCalendarScope(token.scope)) return finish(request, { reason: 'no_scope' })
    const email = emailFromIdToken(token.id_token) || await emailFromAccessToken(token.access_token)
    await saveConnection({
      userId: user.id,
      email,
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
      expiresIn: token.expires_in,
      scope: token.scope,
    })
    return finish(request, { connected: true })
  } catch (error) {
    const reason = error instanceof GoogleApiError ? error.code : 'exchange'
    console.error('google oauth callback', reason)
    return finish(request, { reason })
  }
}
