'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isMissingRelation } from '@/lib/dbErrors'
import { LoadingSpinner, MissingTableNotice, QueryError } from '@/app/components/QueryState'

const supabase = createClient()

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

const SUGGESTED_STORES = ['Grocery', 'Costco', 'Target', 'Pharmacy', 'Hardware']

function blankToNull(value) {
  const trimmed = (value || '').trim()
  return trimmed || null
}

function upsertItem(prev, row) {
  if (!row?.id) return prev
  const index = prev.findIndex((item) => item.id === row.id)
  if (index === -1) return [...prev, row]
  const next = prev.slice()
  next[index] = row
  return next
}

function groupShopping(items) {
  const unchecked = items.filter((item) => !item.checked)
  const checked = items
    .filter((item) => item.checked)
    .sort((a, b) => (b.checked_at || b.created_at || '').localeCompare(a.checked_at || a.created_at || ''))

  const groups = new Map()
  for (const item of unchecked) {
    const key = (item.store || '').trim() || 'General'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(item)
  }

  const keys = [...groups.keys()].sort((a, b) => {
    if (a === 'General') return 1
    if (b === 'General') return -1
    return a.localeCompare(b)
  })

  return {
    groups: keys.map((store) => ({
      store,
      items: groups.get(store).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || '')),
    })),
    checked,
  }
}

export default function ShoppingPage() {
  const nameRef = useRef(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [user, setUser] = useState(null)
  const [live, setLive] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', quantity: '', store: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [actionError, setActionError] = useState('')
  const [clearing, setClearing] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({ name: '', quantity: '', store: '' })

  useEffect(() => {
    let active = true

    supabase.auth.getUser().then(({ data }) => {
      if (active) setUser(data.user)
    })

    async function load() {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('*')
        .order('created_at', { ascending: true })
      if (!active) return
      if (error) {
        setItems([])
        setLoadError(error)
      } else {
        setItems(data || [])
        setLoadError(null)
      }
      setLoading(false)
    }

    load()

    const channel = supabase
      .channel('shopping-items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, (payload) => {
        const eventType = payload.eventType
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          setItems((prev) => upsertItem(prev, payload.new))
        } else if (eventType === 'DELETE') {
          const id = payload.old?.id
          if (!id) {
            load()
            return
          }
          setItems((prev) => prev.filter((item) => item.id !== id))
        }
      })
      .subscribe((status) => {
        if (active) setLive(status === 'SUBSCRIBED')
      })

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (showForm) nameRef.current?.focus()
  }, [showForm])

  const grouped = useMemo(() => groupShopping(items), [items])
  const remaining = items.filter((item) => !item.checked).length
  const checkedCount = items.length - remaining
  const storeOptions = useMemo(() => {
    const used = items.map((item) => (item.store || '').trim()).filter(Boolean)
    return [...new Set([...SUGGESTED_STORES, ...used])]
  }, [items])

  async function handleAdd(e) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setFormError('')
    const { data, error } = await supabase
      .from('shopping_items')
      .insert({
        created_by: user.id,
        name: form.name.trim(),
        quantity: blankToNull(form.quantity),
        store: blankToNull(form.store),
        checked: false,
      })
      .select()
      .single()

    if (error) {
      if (isMissingRelation(error)) setLoadError(error)
      setFormError(error.message)
    } else if (data) {
      setItems((prev) => upsertItem(prev, data))
      setForm((current) => ({ ...current, name: '', quantity: '' }))
      nameRef.current?.focus()
    }
    setSaving(false)
  }

  async function toggleChecked(item) {
    const checked = !item.checked
    const patch = {
      checked,
      checked_at: checked ? new Date().toISOString() : null,
    }
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, ...patch } : row)))
    setActionError('')
    const { data, error } = await supabase
      .from('shopping_items')
      .update(patch)
      .eq('id', item.id)
      .select()
      .single()
    if (error) {
      setItems((prev) => prev.map((row) => (row.id === item.id ? item : row)))
      setActionError(error.message)
      return
    }
    if (data) setItems((prev) => upsertItem(prev, data))
  }

  async function handleDelete(id) {
    setActionError('')
    const previous = items
    setItems((prev) => prev.filter((item) => item.id !== id))
    const { error } = await supabase.from('shopping_items').delete().eq('id', id)
    if (error) {
      setItems(previous)
      setActionError(error.message)
    }
  }

  async function clearChecked() {
    const ids = items.filter((item) => item.checked).map((item) => item.id)
    if (!ids.length) return
    if (!window.confirm(`Remove ${ids.length} checked item${ids.length === 1 ? '' : 's'}?`)) return
    setClearing(true)
    setActionError('')
    const { error } = await supabase.from('shopping_items').delete().in('id', ids)
    if (error) {
      setActionError(error.message)
    } else {
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)))
    }
    setClearing(false)
  }

  function startEdit(item) {
    setEditingId(item.id)
    setEditForm({
      name: item.name,
      quantity: item.quantity || '',
      store: item.store || '',
    })
  }

  async function saveEdit(item) {
    const name = editForm.name.trim()
    if (!name) return
    const patch = {
      name,
      quantity: blankToNull(editForm.quantity),
      store: blankToNull(editForm.store),
    }
    setActionError('')
    const { data, error } = await supabase
      .from('shopping_items')
      .update(patch)
      .eq('id', item.id)
      .select()
      .single()
    if (error) {
      setActionError(error.message)
      return
    }
    if (data) setItems((prev) => upsertItem(prev, data))
    setEditingId(null)
  }

  const missing = isMissingRelation(loadError)

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Shopping List</h2>
            {live && !missing && (
              <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#28A745]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]" />
                Live
              </span>
            )}
          </div>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">
            {items.length === 0
              ? 'Groceries and errands, shared live'
              : `${remaining} to buy${checkedCount ? ` · ${checkedCount} checked` : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {checkedCount > 0 && !missing && (
            <button
              type="button"
              onClick={clearChecked}
              disabled={clearing}
              className="px-3.5 py-2.5 text-[13.5px] font-semibold text-[#FF3B30] hover:bg-[#FFF0EF] rounded-xl transition-colors disabled:opacity-50"
            >
              {clearing ? 'Clearing…' : 'Clear checked'}
            </button>
          )}
          {!missing && (
            <button
              type="button"
              onClick={() => setShowForm((open) => !open)}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#007AFF] hover:bg-[#0066DD] text-white text-[13.5px] font-semibold rounded-xl transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M10 4v12M4 10h12" strokeLinecap="round" />
              </svg>
              Add Item
            </button>
          )}
        </div>
      </div>

      {showForm && !missing && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-5">Add to the list</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Item *</label>
              <input
                ref={nameRef}
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="Milk, paper towels, pick up the mail…"
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Quantity</label>
                <input
                  type="text"
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  placeholder="1 gal, 2, a bunch"
                  className={inputClass}
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Store or category</label>
                <input
                  type="text"
                  value={form.store}
                  onChange={(e) => setForm({ ...form, store: e.target.value })}
                  placeholder="Grocery, Costco, pharmacy…"
                  list="shopping-stores"
                  className={inputClass}
                  autoComplete="off"
                />
                <datalist id="shopping-stores">
                  {storeOptions.map((store) => <option key={store} value={store} />)}
                </datalist>
              </div>
            </div>
            {formError && <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-lg">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
                Close
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Adding…' : 'Add item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {actionError && (
        <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-lg mb-4">{actionError}</p>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : missing ? (
        <MissingTableNotice feature="The shopping list" />
      ) : loadError ? (
        <QueryError message={loadError.message} onRetry={() => window.location.reload()} />
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 card flex flex-col items-center text-center">
          <div className="w-14 h-14 bg-[#F2F2F7] rounded-2xl flex items-center justify-center mb-4">
            <svg viewBox="0 0 20 20" fill="none" stroke="#AEAEB2" strokeWidth="1.5" className="w-7 h-7">
              <path d="M5 7.5h10l-.833 8.333H5.833L5 7.5Z" strokeLinejoin="round" />
              <path d="M7.5 7.5V5.833a2.5 2.5 0 0 1 5 0V7.5" strokeLinecap="round" />
            </svg>
          </div>
          <p className="text-[16px] font-semibold text-[#1C1C1E] mb-1">The list is empty</p>
          <p className="text-[14px] text-[#AEAEB2]">Add something and it shows up for both of you.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.groups.map((group) => (
            <section key={group.store}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2] mb-3">{group.store}</p>
              <div className="space-y-2.5">
                {group.items.map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    editing={editingId === item.id}
                    editForm={editForm}
                    onEditForm={setEditForm}
                    onToggle={() => toggleChecked(item)}
                    onDelete={() => handleDelete(item.id)}
                    onStartEdit={() => startEdit(item)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveEdit(item)}
                  />
                ))}
              </div>
            </section>
          ))}

          {grouped.checked.length > 0 && (
            <section>
              <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[#AEAEB2] mb-3">Checked</p>
              <div className="space-y-2.5">
                {grouped.checked.map((item) => (
                  <ShoppingRow
                    key={item.id}
                    item={item}
                    editing={editingId === item.id}
                    editForm={editForm}
                    onEditForm={setEditForm}
                    onToggle={() => toggleChecked(item)}
                    onDelete={() => handleDelete(item.id)}
                    onStartEdit={() => startEdit(item)}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={() => saveEdit(item)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function ShoppingRow({
  item,
  editing,
  editForm,
  onEditForm,
  onToggle,
  onDelete,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
}) {
  return (
    <div className={`bg-white rounded-2xl p-4 card flex items-center gap-4 ${item.checked ? 'opacity-60' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={item.checked ? `Uncheck ${item.name}` : `Check off ${item.name}`}
        className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
          item.checked ? 'bg-[#34C759] border-[#34C759]' : 'border-[#C7C7CC] hover:border-[#34C759]'
        }`}
      >
        {item.checked && (
          <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.5" className="w-3 h-3">
            <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {editing ? (
        <form
          className="flex-1 min-w-0 grid sm:grid-cols-[1fr_6rem_8rem_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            onSaveEdit()
          }}
        >
          <input
            value={editForm.name}
            onChange={(e) => onEditForm({ ...editForm, name: e.target.value })}
            required
            className={inputClass}
            aria-label="Item name"
          />
          <input
            value={editForm.quantity}
            onChange={(e) => onEditForm({ ...editForm, quantity: e.target.value })}
            placeholder="Qty"
            className={inputClass}
            aria-label="Quantity"
          />
          <input
            value={editForm.store}
            onChange={(e) => onEditForm({ ...editForm, store: e.target.value })}
            placeholder="Store"
            className={inputClass}
            aria-label="Store or category"
          />
          <div className="flex items-center gap-1">
            <button type="submit" className="px-3 py-2 text-[13px] font-semibold text-white bg-[#007AFF] rounded-xl">Save</button>
            <button type="button" onClick={onCancelEdit} className="px-3 py-2 text-[13px] font-medium text-[#6C6C70] rounded-xl hover:bg-[#F2F2F7]">Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-medium text-[#1C1C1E] break-words ${item.checked ? 'line-through' : ''}`}>
            {item.name}
            {item.quantity && <span className="text-[#6C6C70] font-normal"> · {item.quantity}</span>}
          </p>
          {item.checked && item.store && (
            <p className="text-[12px] text-[#AEAEB2] mt-0.5">{item.store}</p>
          )}
        </div>
      )}

      {!editing && (
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onStartEdit}
            aria-label={`Edit ${item.name}`}
            className="text-[#C7C7CC] hover:text-[#007AFF] hover:bg-[#EBF5FF] p-1.5 rounded-lg transition-all"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
              <path d="M11.667 4.167 15.833 8.333M3.333 16.667l1.25-4.584L13.333 3.333a1.667 1.667 0 0 1 2.357 2.357L6.94 14.44 2.5 15.833l.833.834Z" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${item.name}`}
            className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg transition-all"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
              <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
