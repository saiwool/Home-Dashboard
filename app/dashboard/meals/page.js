export default function MealsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Meals</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Plan weekly meals and recipes</p>
      </div>
      <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
          <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
            <path d="M6.667 2.5v6.25a2.5 2.5 0 0 0 2.5 2.5v6.25M5.833 2.5v3.333M7.5 2.5v3.333M13.333 2.5s1.25 1.667 1.25 3.333-1.25 2.5-1.25 4.167v7.5" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No meals planned</p>
        <p className="text-[14px] text-[#AEAEB2] max-w-xs">Plan your weekly meals and keep favorite recipes here.</p>
      </div>
    </div>
  )
}
