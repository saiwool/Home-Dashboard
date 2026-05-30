export default function HomeContactsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Contacts</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Plumbers, landlords, neighbors and more</p>
      </div>
      <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
          <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
            <circle cx="10" cy="6.667" r="3.333" />
            <path d="M3.333 17.5c0-3.333 2.917-6.25 6.667-6.25s6.667 2.917 6.667 6.25" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No contacts saved</p>
        <p className="text-[14px] text-[#AEAEB2] max-w-xs">Save numbers and notes for your landlord, repair services, and neighbors.</p>
      </div>
    </div>
  )
}
