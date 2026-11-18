import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { allowedOrigin, missingGoogleEnv } from '@/lib/google/config'
import { requireUser } from '@/lib/google/http'
import { GOOGLE_SCOPES, OAUTH_ORIGIN_COOKIE, OAUTH_STATE_COOKIE } from '@/lib/google/messages'
import { oauthCookieOptions } from '@/lib/google/oauthCookies'

export const runtime = 'nodejs'

function calendarUrl(request, reason) {
  const url = new URL('/dashboard/calendar', request.nextUrl.origin)
  if (reason) {
    url.searchParams.set('google', 'error')
    url.searchParams.set('reason', reason)
  }
  return url
}

export async function GET(request) {
  const { user } = await requireUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (missingGoogleEnv().length) {
    return NextResponse.redirect(calendarUrl(request, 'not_configured'))
  }
  const origin = allowedOrigin(request)
  if (!origin) {
    return NextResponse.redirect(calendarUrl(request, 'bad_origin'))
  }

  const state = randomBytes(24).toString('hex')
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  })
  const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
  const options = oauthCookieOptions(origin.startsWith('https://'))
  response.cookies.set(OAUTH_STATE_COOKIE, state, options)
  response.cookies.set(OAUTH_ORIGIN_COOKIE, origin, options)
  return response
}
