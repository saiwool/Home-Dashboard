export default function MaintenancePage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Maintenance</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Track home repairs and upkeep</p>
      </div>
      <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
          <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
            <path d="M12.5 4.167c1.25-1.25 3.333-1.25 4.583 0s1.25 3.333 0 4.583L15 6.667 13.333 8.333l2.5 2.5c-1.25 1.25-3.333 1.25-4.583 0L7.5 14.583c-.834.834-2.083.834-2.917 0-.833-.833-.833-2.083 0-2.916L8.333 7.917C7.083 6.667 7.083 4.583 8.333 3.333" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No maintenance logs</p>
        <p className="text-[14px] text-[#AEAEB2] max-w-xs">Track repairs, inspections, and home projects here.</p>
      </div>
    </div>
  )
}
