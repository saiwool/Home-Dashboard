'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTimezone } from '@/app/hooks/useTimezone'
import { getTodayStr, getMonthRange } from '@/lib/dateUtils'

const supabase = createClient()

const CATEGORIES = ['Housing', 'Groceries', 'Utilities', 'Transport', 'Dining', 'Entertainment', 'Health', 'Shopping', 'Income', 'General']

const fmt = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

export default function BudgetPage() {
  const tz = useTimezone()
  const today = useMemo(() => getTodayStr(tz), [tz])

  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({
    name: '', amount: '', category: 'General', type: 'expense', item_date: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)) }, [])
  useEffect(() => { fetchItems() }, [monthOffset, tz])

  async function fetchItems() {
    setLoading(true)
    const { start, end } = getMonthRange(monthOffset, tz)
    const { data } = await supabase
      .from('budget_items')
      .select('*')
      .gte('item_date', start)
      .lte('item_date', end)
      .order('item_date', { ascending: false })
    setItems(data || [])
    setLoading(false)
  }

  function openForm() {
    setForm({ name: '', amount: '', category: 'General', type: 'expense', item_date: today })
    setShowForm(!showForm)
  }

  async function handleAdd(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('budget_items').insert({
      user_id: user.id,
      name: form.name,
      amount: parseFloat(form.amount),
      category: form.category,
      type: form.type,
      item_date: form.item_date,
    })
    if (!error) {
      setForm({ name: '', amount: '', category: 'General', type: 'expense', item_date: today })
      setShowForm(false)
      fetchItems()
    }
    setSaving(false)
  }

  async function handleDelete(id) {
    await supabase.from('budget_items').delete().eq('id', id)
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  const income = items.filter((i) => i.type === 'income').reduce((s, i) => s + Number(i.amount), 0)
  const expenses = items.filter((i) => i.type === 'expense').reduce((s, i) => s + Number(i.amount), 0)
  const net = income - expenses
  const { label } = useMemo(() => getMonthRange(monthOffset, tz), [monthOffset, tz])

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Budget</h2>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">Household finances</p>
        </div>
        <button
          onClick={openForm}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors shrink-0"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M10 4v12M4 10h12" strokeLinecap="round" />
          </svg>
          Add Item
        </button>
      </div>

      {/* Month nav */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setMonthOffset(monthOffset - 1)}
          className="p-2 rounded-xl hover:bg-[#F2F2F7] text-[#6C6C70] transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M12.5 15L7.5 10l5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="text-[15px] font-medium text-[#1C1C1E] min-w-[9rem] text-center">{label}</span>
        <button
          onClick={() => setMonthOffset(monthOffset + 1)}
          disabled={monthOffset >= 0}
          className="p-2 rounded-xl hover:bg-[#F2F2F7] text-[#6C6C70] disabled:opacity-25 transition-colors"
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M7.5 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-5 card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#AEAEB2] mb-1.5">Income</p>
          <p className="text-[22px] font-bold text-[#28A745] tracking-tight">{fmt(income)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#AEAEB2] mb-1.5">Expenses</p>
          <p className="text-[22px] font-bold text-[#FF3B30] tracking-tight">{fmt(expenses)}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 card">
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#AEAEB2] mb-1.5">Net</p>
          <p className={`text-[22px] font-bold tracking-tight ${net >= 0 ? 'text-[#007AFF]' : 'text-[#E6860A]'}`}>{fmt(net)}</p>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">New Budget Item</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Description *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Rent, groceries, salary…"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Type</label>
                <div className="flex bg-[#F2F2F7] rounded-xl p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: 'expense' })}
                    className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all ${
                      form.type === 'expense' ? 'bg-white text-[#FF3B30] shadow-sm' : 'text-[#6C6C70]'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, type: 'income' })}
                    className={`flex-1 py-2 text-[13px] font-semibold rounded-lg transition-all ${
                      form.type === 'income' ? 'bg-white text-[#28A745] shadow-sm' : 'text-[#6C6C70]'
                    }`}
                  >
                    Income
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Category</label>
                <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={inputClass}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Date</label>
                <input type="date" value={form.item_date} onChange={(e) => setForm({ ...form, item_date: e.target.value })} className={inputClass} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-[#007AFF]/30 border-t-[#007AFF] rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 card text-center">
          <p className="text-[15px] font-semibold text-[#1C1C1E] mb-1">No items for {label}</p>
          <p className="text-[14px] text-[#AEAEB2]">Add income or expenses to track your budget.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#F2F2F7]">
                <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-wider">Description</th>
                <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-wider hidden sm:table-cell">Category</th>
                <th className="text-left px-5 py-3.5 text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-wider hidden sm:table-cell">Date</th>
                <th className="text-right px-5 py-3.5 text-[11px] font-semibold text-[#AEAEB2] uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={`hover:bg-[#F9F9FB] transition-colors ${i > 0 ? 'border-t border-[#F2F2F7]' : ''}`}>
                  <td className="px-5 py-3.5 text-[14px] font-medium text-[#1C1C1E]">{item.name}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#6C6C70] hidden sm:table-cell">{item.category}</td>
                  <td className="px-5 py-3.5 text-[13px] text-[#6C6C70] hidden sm:table-cell">
                    {new Date(item.item_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className={`px-5 py-3.5 text-right text-[14px] font-semibold ${item.type === 'income' ? 'text-[#28A745]' : 'text-[#FF3B30]'}`}>
                    {item.type === 'income' ? '+' : '−'}{fmt(item.amount)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg transition-all duration-150"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                        <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
