export default function DateNightsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Date Nights</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Plan and remember special evenings</p>
      </div>
      <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
          <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
            <path d="M10 16.25S2.5 11.875 2.5 7.083c0-1.958 1.667-3.333 3.542-3.333C7.5 3.75 8.75 4.583 10 5.833c1.25-1.25 2.5-2.083 3.958-2.083 1.875 0 3.542 1.375 3.542 3.333C17.5 11.875 10 16.25 10 16.25Z" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No date nights logged</p>
        <p className="text-[14px] text-[#AEAEB2] max-w-xs">Plan ahead or remember past evenings — restaurants, movies, adventures.</p>
      </div>
    </div>
  )
}
