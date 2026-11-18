'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTimezone } from '@/app/hooks/useTimezone'
import { addDays, getTodayStr, startOfWeek } from '@/lib/dateUtils'
import { isMissingRelation } from '@/lib/dbErrors'
import { LoadingSpinner, MissingTableNotice, QueryError } from '@/app/components/QueryState'

const supabase = createClient()

const inputClass = 'w-full px-3.5 py-2.5 bg-[#F9F9FB] rounded-xl border border-[#E5E5EA] text-[14px] text-[#1C1C1E] placeholder-[#AEAEB2] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 focus:border-[#007AFF] transition-all'

const SLOTS = ['breakfast', 'lunch', 'dinner']
const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' }

function emptyIngredient() {
  return { name: '', quantity: '', store: '' }
}

function asIngredients(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      name: String(row.name || ''),
      quantity: String(row.quantity || ''),
      store: String(row.store || ''),
    }))
}

function cleanIngredients(rows) {
  return asIngredients(rows)
    .map((row) => ({
      name: row.name.trim(),
      quantity: row.quantity.trim(),
      store: row.store.trim(),
    }))
    .filter((row) => row.name)
}

function formatWeekLabel(monday) {
  const sunday = addDays(monday, 6)
  const start = new Date(monday + 'T00:00:00')
  const end = new Date(sunday + 'T00:00:00')
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  const sameYear = start.getFullYear() === end.getFullYear()
  const startText = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
  const endText = end.toLocaleDateString('en-US', sameMonth
    ? { day: 'numeric', year: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startText} – ${endText}`
}

function weekdayShort(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })
}

export default function MealsPage() {
  const tz = useTimezone()
  const today = useMemo(() => getTodayStr(tz), [tz])
  const [weekOffset, setWeekOffset] = useState(0)
  const monday = useMemo(() => addDays(startOfWeek(today), weekOffset * 7), [today, weekOffset])
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday])

  const [meals, setMeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [user, setUser] = useState(null)
  const [showExtras, setShowExtras] = useState(false)
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState(null)
  const [addingId, setAddingId] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const { data, error } = await supabase
        .from('meals')
        .select('*')
        .gte('meal_date', monday)
        .lte('meal_date', addDays(monday, 6))
        .order('meal_date', { ascending: true })
      if (!active) return
      if (error) {
        setMeals([])
        setLoadError(error)
      } else {
        setMeals(data || [])
        setLoadError(null)
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [monday, reloadToken])

  function mealFor(date, slot) {
    return meals.find((meal) => meal.meal_date === date && meal.slot === slot) || null
  }

  function openNew(date, slot) {
    setFormError('')
    setForm({
      id: null,
      meal_date: date,
      slot,
      title: '',
      notes: '',
      ingredients: [emptyIngredient()],
    })
  }

  function openEdit(meal) {
    const ingredients = asIngredients(meal.ingredients)
    setFormError('')
    setForm({
      id: meal.id,
      meal_date: meal.meal_date,
      slot: meal.slot,
      title: meal.title,
      notes: meal.notes || '',
      ingredients: ingredients.length ? ingredients : [emptyIngredient()],
    })
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!user || !form) return
    setSaving(true)
    setFormError('')
    const payload = {
      meal_date: form.meal_date,
      slot: form.slot,
      title: form.title.trim(),
      notes: form.notes.trim() || null,
      ingredients: cleanIngredients(form.ingredients),
    }

    const query = form.id
      ? supabase.from('meals').update(payload).eq('id', form.id)
      : supabase.from('meals').insert({ ...payload, created_by: user.id })

    const { data, error } = await query.select().single()
    if (error) {
      if (isMissingRelation(error)) setLoadError(error)
      setFormError(error.code === '23505'
        ? `That day already has ${SLOT_LABEL[form.slot].toLowerCase()}. Edit it instead.`
        : error.message)
    } else if (data) {
      setMeals((prev) => {
        const without = prev.filter((meal) => meal.id !== data.id)
        return [...without, data]
      })
      setForm(null)
    }
    setSaving(false)
  }

  async function handleDelete(meal) {
    setNotice(null)
    const previous = meals
    setMeals((prev) => prev.filter((row) => row.id !== meal.id))
    if (form?.id === meal.id) setForm(null)
    const { error } = await supabase.from('meals').delete().eq('id', meal.id)
    if (error) {
      setMeals(previous)
      setNotice({ tone: 'error', text: error.message })
    }
  }

  async function addIngredientsToList(meal) {
    if (!user) return
    const ingredients = cleanIngredients(meal.ingredients)
    if (!ingredients.length) {
      setNotice({ tone: 'error', text: 'Add ingredients to this meal first.' })
      return
    }
    setAddingId(meal.id)
    setNotice(null)
    const rows = ingredients.map((ingredient) => ({
      created_by: user.id,
      name: ingredient.name,
      quantity: ingredient.quantity || null,
      store: ingredient.store || null,
      checked: false,
    }))
    const { error } = await supabase.from('shopping_items').insert(rows)
    if (error) {
      setNotice({
        tone: 'error',
        text: isMissingRelation(error)
          ? 'The shopping list table is not set up yet.'
          : error.message,
      })
    } else {
      const count = rows.length
      setNotice({
        tone: 'info',
        text: `Added ${count} ingredient${count === 1 ? '' : 's'} to the shopping list.`,
      })
    }
    setAddingId(null)
  }

  function updateIngredient(index, patch) {
    setForm((current) => {
      if (!current) return current
      const ingredients = current.ingredients.map((row, i) => (i === index ? { ...row, ...patch } : row))
      return { ...current, ingredients }
    })
  }

  const missing = isMissingRelation(loadError)

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-[22px] font-bold text-[#1C1C1E] tracking-[-0.01em]">Meals</h2>
          <p className="text-[14px] text-[#AEAEB2] mt-0.5">Dinner for the week. Breakfast and lunch if you want them.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowExtras((value) => !value)}
          className={`px-3.5 py-2 text-[13px] font-semibold rounded-xl transition-colors ${
            showExtras ? 'bg-[#EBF5FF] text-[#007AFF]' : 'bg-white text-[#3A3A3C] card hover:bg-[#F9F9FB]'
          }`}
        >
          {showExtras ? 'Hide breakfast & lunch' : 'Breakfast & lunch'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value - 1)}
            aria-label="Previous week"
            className="w-9 h-9 rounded-xl bg-white card text-[#1C1C1E] hover:bg-[#F9F9FB] flex items-center justify-center"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
              <path d="M12.5 5 7.5 10l5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <p className="text-[15px] font-semibold text-[#1C1C1E] min-w-[11rem] text-center">{formatWeekLabel(monday)}</p>
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value + 1)}
            aria-label="Next week"
            className="w-9 h-9 rounded-xl bg-white card text-[#1C1C1E] hover:bg-[#F9F9FB] flex items-center justify-center"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
              <path d="M7.5 5 12.5 10l-5 5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        {weekOffset !== 0 && (
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="text-[13px] font-semibold text-[#007AFF] hover:underline"
          >
            This week
          </button>
        )}
      </div>

      {notice && (
        <div className={`mb-4 flex items-center justify-between gap-3 px-4 py-3 rounded-xl ${
          notice.tone === 'error' ? 'bg-[#FFF0EF] text-[#FF3B30]' : 'bg-[#EBF5FF] text-[#1C1C1E]'
        }`}>
          <p className="text-[14px]">
            {notice.text}
            {notice.tone === 'info' && (
              <>
                {' '}
                <Link href="/dashboard/shopping" className="font-semibold text-[#007AFF]">Open the list</Link>
              </>
            )}
          </p>
          <button type="button" onClick={() => setNotice(null)} className="text-[13px] font-medium shrink-0">Dismiss</button>
        </div>
      )}

      {form && (
        <div className="bg-white rounded-2xl p-6 card mb-6">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] mb-1">
            {form.id ? 'Edit' : 'Add'} {SLOT_LABEL[form.slot].toLowerCase()}
          </h3>
          <p className="text-[13px] text-[#AEAEB2] mb-5">
            {weekdayShort(form.meal_date)} {new Date(form.meal_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
          </p>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Meal *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="Tacos, leftover soup, breakfast burritos…"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-[#6C6C70] mb-1.5 uppercase tracking-wider">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Optional"
                className={`${inputClass} resize-none`}
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[12px] font-semibold text-[#6C6C70] uppercase tracking-wider">Ingredients</label>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, ingredients: [...form.ingredients, emptyIngredient()] })}
                  className="text-[13px] font-semibold text-[#007AFF]"
                >
                  Add ingredient
                </button>
              </div>
              <div className="space-y-2">
                {form.ingredients.map((ingredient, index) => (
                  <div key={index} className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_8rem_auto] gap-2">
                    <input
                      value={ingredient.name}
                      onChange={(e) => updateIngredient(index, { name: e.target.value })}
                      placeholder="Ingredient"
                      className={inputClass}
                      aria-label={`Ingredient ${index + 1}`}
                    />
                    <input
                      value={ingredient.quantity}
                      onChange={(e) => updateIngredient(index, { quantity: e.target.value })}
                      placeholder="Qty"
                      className={inputClass}
                      aria-label={`Quantity ${index + 1}`}
                    />
                    <input
                      value={ingredient.store}
                      onChange={(e) => updateIngredient(index, { store: e.target.value })}
                      placeholder="Store"
                      className={inputClass}
                      aria-label={`Store ${index + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => setForm({
                        ...form,
                        ingredients: form.ingredients.length === 1
                          ? [emptyIngredient()]
                          : form.ingredients.filter((_, i) => i !== index),
                      })}
                      aria-label="Remove ingredient"
                      className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] px-2 rounded-lg"
                    >
                      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                        <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {formError && <p className="text-[13px] text-[#FF3B30] bg-[#FFF0EF] px-3 py-2 rounded-lg">{formError}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 text-[14px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-xl transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-[#007AFF] hover:bg-[#0066DD] disabled:opacity-50 text-white text-[14px] font-semibold rounded-xl transition-colors">
                {saving ? 'Saving…' : 'Save meal'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : missing ? (
        <MissingTableNotice feature="Meal planning" />
      ) : loadError ? (
        <QueryError message={loadError.message} onRetry={() => setReloadToken((value) => value + 1)} />
      ) : (
        <div className="space-y-3">
          {days.map((day) => {
            const isToday = day === today
            return (
              <div key={day} className={`bg-white rounded-2xl p-4 sm:p-5 card ${isToday ? 'ring-2 ring-[#007AFF]/25' : ''}`}>
                <div className="flex gap-4">
                  <div className="w-12 shrink-0 text-center pt-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-[#AEAEB2]">{weekdayShort(day)}</p>
                    <p className={`text-[22px] font-bold leading-tight ${isToday ? 'text-[#007AFF]' : 'text-[#1C1C1E]'}`}>
                      {new Date(day + 'T00:00:00').getDate()}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0 divide-y divide-[#F2F2F7]">
                    {SLOTS.map((slot) => {
                      const meal = mealFor(day, slot)
                      if (slot !== 'dinner' && !meal && !showExtras) return null
                      return (
                        <div key={slot} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#AEAEB2]">{SLOT_LABEL[slot]}</p>
                            {meal ? (
                              <>
                                <p className="text-[15px] font-semibold text-[#1C1C1E] break-words mt-0.5">{meal.title}</p>
                                {meal.notes && <p className="text-[13px] text-[#6C6C70] mt-0.5 break-words">{meal.notes}</p>}
                                <p className="text-[12px] text-[#AEAEB2] mt-1">
                                  {cleanIngredients(meal.ingredients).length} ingredients
                                </p>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openNew(day, slot)}
                                className="text-[14px] font-medium text-[#007AFF] mt-0.5"
                              >
                                Add {SLOT_LABEL[slot].toLowerCase()}
                              </button>
                            )}
                          </div>
                          {meal && (
                            <div className="flex flex-wrap items-center justify-end gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => addIngredientsToList(meal)}
                                disabled={addingId === meal.id}
                                className="px-2.5 py-1.5 text-[12.5px] font-semibold text-[#007AFF] hover:bg-[#EBF5FF] rounded-lg disabled:opacity-50"
                              >
                                {addingId === meal.id ? 'Adding…' : 'Add to list'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openEdit(meal)}
                                className="px-2.5 py-1.5 text-[12.5px] font-medium text-[#6C6C70] hover:bg-[#F2F2F7] rounded-lg"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(meal)}
                                aria-label={`Remove ${meal.title}`}
                                className="text-[#C7C7CC] hover:text-[#FF3B30] hover:bg-[#FFF0EF] p-1.5 rounded-lg"
                              >
                                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                                  <path d="M5 15L15 5M5 5l10 10" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
