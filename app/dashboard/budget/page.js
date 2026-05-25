'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

const CATEGORIES = ['Housing', 'Groceries', 'Utilities', 'Transport', 'Dining', 'Entertainment', 'Health', 'Shopping', 'Income', 'General']

const fmt = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

function getMonthRange(offset = 0) {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const start = `${year}-${month}-01`
  const lastDay = new Date(year, d.getMonth() + 1, 0).getDate()
  const end = `${year}-${month}-${lastDay}`
  const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return { start, end, label }
}

export default function BudgetPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({
    name: '', amount: '', category: 'General', type: 'expense',
    item_date: new Date().toISOString().split('T')[0],
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  useEffect(() => {
    fetchItems()
  }, [monthOffset])

  async function fetchItems() {
    setLoading(true)
    const { start, end } = getMonthRange(monthOffset)
    const { data } = await supabase
      .from('budget_items')
      .select('*')
      .gte('item_date', start)
      .lte('item_date', end)
      .order('item_date', { ascending: false })
    setItems(data || [])
    setLoading(false)
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
      setForm({ name: '', amount: '', category: 'General', type: 'expense', item_date: new Date().toISOString().split('T')[0] })
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

  const { label } = getMonthRange(monthOffset)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Budget</h2>
          <p className="text-slate-500 text-sm mt-0.5">Household finances</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Item
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setMonthOffset(monthOffset - 1)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-medium text-slate-700 min-w-36 text-center">{label}</span>
        <button onClick={() => setMonthOffset(monthOffset + 1)} disabled={monthOffset >= 0} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 disabled:opacity-30 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-2xl p-5 border border-green-100">
          <p className="text-xs font-medium text-green-600 uppercase tracking-wider">Income</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{fmt(income)}</p>
        </div>
        <div className="bg-red-50 rounded-2xl p-5 border border-red-100">
          <p className="text-xs font-medium text-red-500 uppercase tracking-wider">Expenses</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(expenses)}</p>
        </div>
        <div className={`rounded-2xl p-5 border ${net >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-orange-50 border-orange-100'}`}>
          <p className={`text-xs font-medium uppercase tracking-wider ${net >= 0 ? 'text-indigo-600' : 'text-orange-600'}`}>Net</p>
          <p className={`text-2xl font-bold mt-1 ${net >= 0 ? 'text-indigo-700' : 'text-orange-600'}`}>{fmt(net)}</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-semibold text-slate-900 mb-4">New Budget Item</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Rent, groceries, salary…"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                  <button type="button" onClick={() => setForm({ ...form, type: 'expense' })}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${form.type === 'expense' ? 'bg-red-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    Expense
                  </button>
                  <button type="button" onClick={() => setForm({ ...form, type: 'income' })}
                    className={`flex-1 py-2 text-sm font-medium transition-colors ${form.type === 'income' ? 'bg-green-500 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                    Income
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                <input
                  type="date"
                  value={form.item_date}
                  onChange={(e) => setForm({ ...form, item_date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-lg">
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400">Loading…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-slate-400">No items for {label}</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Category</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Date</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-medium text-slate-800">{item.name}</td>
                  <td className="px-5 py-3 text-slate-500 hidden sm:table-cell">{item.category}</td>
                  <td className="px-5 py-3 text-slate-500 hidden sm:table-cell">
                    {new Date(item.item_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className={`px-5 py-3 text-right font-semibold ${item.type === 'income' ? 'text-green-600' : 'text-red-500'}`}>
                    {item.type === 'income' ? '+' : '-'}{fmt(item.amount)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => handleDelete(item.id)} className="text-slate-300 hover:text-red-400 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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
