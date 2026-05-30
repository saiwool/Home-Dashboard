export default function DocumentsPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Documents</h2>
        <p className="text-[14px] text-[#AEAEB2] mt-0.5">Important household files and records</p>
      </div>
      <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
        <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
          <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
            <path d="M5.833 2.5h5.834L15.833 6.667V17.5H5.833V2.5Z" strokeLinejoin="round" />
            <path d="M11.667 2.5v4.167h4.166M8.333 10.833h3.334M8.333 13.333h3.334" strokeLinecap="round" />
          </svg>
        </div>
        <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">No documents yet</p>
        <p className="text-[14px] text-[#AEAEB2] max-w-xs">Store leases, warranties, insurance docs, and other important files.</p>
      </div>
    </div>
  )
}
