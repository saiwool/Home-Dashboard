export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
    </div>
  )
}

export function MissingTableNotice({ feature, compact = false }) {
  const message = `${feature} is not set up yet. In the Supabase SQL Editor, run supabase/migrations/20261117_new_tabs.sql, then refresh.`

  if (compact) {
    return <p className="text-[14px] text-[#AEAEB2] leading-snug">{message}</p>
  }

  return (
    <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
      <div className="w-14 h-14 bg-[#FFF4E5] rounded-2xl flex items-center justify-center mb-4">
        <svg viewBox="0 0 20 20" fill="none" stroke="#E6860A" strokeWidth="1.5" className="w-7 h-7">
          <path d="M10 7.5v4.167M10 14.583h.008" strokeLinecap="round" />
          <path d="M9.167 3.333 2.5 15.833h15L10.833 3.333a1 1 0 0 0-1.666 0Z" strokeLinejoin="round" />
        </svg>
      </div>
      <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">{feature} is not set up yet</p>
      <p className="text-[14px] text-[#AEAEB2] max-w-sm">{message}</p>
    </div>
  )
}

export function QueryError({ message, onRetry }) {
  return (
    <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
      <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">Couldn&apos;t load this</p>
      <p className="text-[14px] text-[#AEAEB2] max-w-sm mb-4">{message || 'Something went wrong talking to the database.'}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[14px] font-semibold rounded-xl transition-colors"
        >
          Try again
        </button>
      )}
    </div>
  )
}
