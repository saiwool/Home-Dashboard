'use client'

import { THEMES } from '@/lib/theme'
import { useTheme } from '@/app/components/ThemeProvider'

export default function ThemeToggle({ compact = false }) {
  const { theme, setTheme, saveError } = useTheme()
  const current = THEMES.find((item) => item.id === theme) || THEMES[2]

  if (compact) {
    const index = THEMES.findIndex((item) => item.id === current.id)
    const next = THEMES[(index + 1) % THEMES.length]
    return (
      <button
        type="button"
        onClick={() => setTheme(next.id)}
        title={saveError ? `${current.label}. ${saveError}` : `Theme: ${current.label}`}
        aria-label={`Theme is ${current.label}. Switch to ${next.label}.`}
        className="px-2.5 py-1 rounded-lg text-[12px] font-semibold text-[#6C6C70] hover:bg-[#F2F2F7] hover:text-[#1C1C1E] transition-colors"
      >
        {current.label}
      </button>
    )
  }

  return (
    <div>
      <div className="flex bg-[#F2F2F7] rounded-xl p-0.5" role="group" aria-label="Color theme">
        {THEMES.map((option) => {
          const active = option.id === current.id
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(option.id)}
              className={`flex-1 px-2 py-1.5 rounded-[10px] text-[12px] font-semibold transition-colors ${
                active ? 'bg-white text-[#1C1C1E] shadow-sm' : 'text-[#6C6C70] hover:text-[#1C1C1E]'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      {saveError && (
        <p className="text-[11px] text-[#FF3B30] mt-1.5 leading-snug">{saveError}</p>
      )}
    </div>
  )
}
