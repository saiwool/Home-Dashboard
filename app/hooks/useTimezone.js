'use client'
import { useSyncExternalStore } from 'react'
import { DEFAULT_TZ } from '@/lib/dateUtils'

function subscribe() {
  return () => {}
}

function snapshot() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ
}

export function useTimezone() {
  return useSyncExternalStore(subscribe, snapshot, () => DEFAULT_TZ)
}
