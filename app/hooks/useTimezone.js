'use client'
import { useState, useEffect } from 'react'
import { DEFAULT_TZ } from '@/lib/dateUtils'

export function useTimezone() {
  const [tz, setTz] = useState(DEFAULT_TZ)
  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TZ)
  }, [])
  return tz
}
