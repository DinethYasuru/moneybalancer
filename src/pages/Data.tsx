import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { useSettings } from '../hooks/useSettings'
import { useMerchantMemory } from '../hooks/useMerchantMemory'
import { suggestCategoriesForExpenses } from '../lib/ai'
import type { Expense } from '../lib/types'
import './Data.css'

interface Counts {
  expenses: number
  attachments: number
  bankStatements: number
  statementTransactions: number
  recurringBills: number
  goals: number
  categories: number
}

interface Suggestion {
  expense: Expense
  oldCategoryId: string | null
  newCategoryId: string | null
  include: boolean
}

const BATCH_SIZE = 80

export function Data() {
  const { user } = useAuth()
  const { categories } = useCategories()
  const { settings } = useSettings()
  const { learn } = useMerchantMemory()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const [scope, setScope] = useState<'uncategorized' | 'all'>('uncategorized')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [aiError, setAiError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)

  const aiReady = settings.ai_config.enabled && !!settings.ai_config.api_key
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized'

  const refresh = useCallback(async () => {
    if (!user) return
    const [expenses, attachments, bankStatements, statementTransactions, recurringBills, goals, categoriesCount] = await Promise.all([
      supabase.from('expenses').select('id', { count: 'exact', head: true }),
      supabase.from('attachments').select('id', { count: 'exact', head: true }),
      supabase.from('bank_statements').select('id', { count: 'exact', head: true }),
      supabase.from('statement_transactions').select('id', { count: 'exact', head: true }),
      supabase.from('recurring_bills').select('id', { count: 'exact', head: true }),
      supabase.from('savings_goals').select('id', { count: 'exact', head: true }),
      supabase.from('categories').select('id', { count: 'exact', head: true }),
    ])
    setCounts({
      expenses: expenses.count ?? 0,
      attachments: attachments.count ?? 0,
      bankStatements: bankStatements.count ?? 0,
      statementTransactions: statementTransactions.count ?? 0,
      recurringBills: recurringBills.count ?? 0,
      goals: goals.count ?? 0,
      categories: categoriesCount.count ?? 0,
    })
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function removeExactDuplicateExpenses() {
    if (!user) return
    setBusy('dedupe')
    setMessage(null)
    const { data: expenses } = await supabase.from('expenses').select('*').order('created_at', { ascending: true })
    const groups = new Map<string, string[]>()
    for (const e of expenses ?? []) {
      const key = `${e.expense_date}|${e.amount}|${(e.description ?? '').trim().toLowerCase()}`
      const list = groups.get(key) ?? []
      list.push(e.id)
      groups.set(key, list)
    }
    const toDelete = [...groups.values()].flatMap((ids) => ids.slice(1))
    if (toDelete.length > 0) {
      await supabase.from('expenses').delete().in('id', toDelete)
    }
    setBusy(null)
    setMessage(toDelete.length > 0 ? `Removed ${toDelete.length} duplicate expense(s).` : 'No exact duplicates found.')
    refresh()
  }

  async function deleteAllExpenses() {
    if (!user) return
    if (!confirm(`Delete ALL ${counts?.expenses ?? 0} expenses? This cannot be undone.`)) return
    setBusy('expenses')
    setMessage(null)
    await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setBusy(null)
    setMessage('All expenses deleted.')
    refresh()
  }

  async function deleteAllStatements() {
    if (!user) return
    if (!confirm(`Delete ALL ${counts?.bankStatements ?? 0} imported statements and their transaction records? Expenses already created from them are kept.`))
      return
    setBusy('statements')
    setMessage(null)
    const { data: statements } = await supabase.from('bank_statements').select('storage_path')
    const paths = (statements ?? []).map((s) => s.storage_path)
    if (paths.length > 0) await supabase.storage.from('bank-statements').remove(paths)
    await supabase.from('statement_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('bank_statements').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setBusy(null)
    setMessage('All statement imports deleted.')
    refresh()
  }

  async function handleReanalyze() {
    if (!user) return
    setBusy('reanalyze')
    setAiError(null)
    setSuggestions([])

    let query = supabase.from('expenses').select('*')
    if (scope === 'uncategorized') query = query.is('category_id', null)
    const { data: expenses } = await query.order('expense_date', { ascending: false })

    if (!expenses || expenses.length === 0) {
      setBusy(null)
      setMessage(scope === 'uncategorized' ? 'No uncategorized expenses to re-analyze.' : 'No expenses found.')
      return
    }

    try {
      const categoryNames = categories.map((c) => c.name)
      const results: Suggestion[] = []

      for (let i = 0; i < expenses.length; i += BATCH_SIZE) {
        const batch = expenses.slice(i, i + BATCH_SIZE)
        const suggested = await suggestCategoriesForExpenses(
          batch.map((e) => ({ id: e.id, description: e.description ?? '(no description)', amount: e.amount })),
          settings.ai_config,
          categoryNames,
        )
        const byId = new Map(suggested.map((s) => [s.id, s.category]))

        for (const e of batch) {
          const suggestedName = byId.get(e.id)
          const match = suggestedName ? categories.find((c) => c.name.toLowerCase() === suggestedName.toLowerCase()) : null
          if (match && match.id !== e.category_id) {
            results.push({ expense: e, oldCategoryId: e.category_id, newCategoryId: match.id, include: true })
          }
        }
      }

      setSuggestions(results)
      if (results.length === 0) setMessage('AI reviewed everything in scope but had no better category suggestions.')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI re-analysis failed.')
    }
    setBusy(null)
  }

  async function applySuggestions() {
    setApplying(true)
    const included = suggestions.filter((s) => s.include)
    for (const s of included) {
      await supabase.from('expenses').update({ category_id: s.newCategoryId }).eq('id', s.expense.id)
      if (s.expense.description && s.newCategoryId) learn(s.expense.description, s.newCategoryId)
    }
    setApplying(false)
    setMessage(`Updated ${included.length} expense${included.length === 1 ? '' : 's'}.`)
    setSuggestions([])
    refresh()
  }

  return (
    <div className="data-page page-enter">
      <h2>Data</h2>
      <p className="data-hint">An overview of what's stored in your account, and tools to clean it up.</p>

      {counts && (
        <div className="data-counts stagger">
          <div className="card data-count-card">
            <span className="data-count-value">{counts.expenses}</span>
            <span className="data-count-label">Expenses</span>
          </div>
          <div className="card data-count-card">
            <span className="data-count-value">{counts.attachments}</span>
            <span className="data-count-label">Attachments</span>
          </div>
          <div className="card data-count-card">
            <span className="data-count-value">{counts.bankStatements}</span>
            <span className="data-count-label">Statement imports</span>
          </div>
          <div className="card data-count-card">
            <span className="data-count-value">{counts.statementTransactions}</span>
            <span className="data-count-label">Statement rows</span>
          </div>
          <div className="card data-count-card">
            <span className="data-count-value">{counts.recurringBills}</span>
            <span className="data-count-label">Recurring bills</span>
          </div>
          <div className="card data-count-card">
            <span className="data-count-value">{counts.goals}</span>
            <span className="data-count-label">Savings goals</span>
          </div>
          <div className="card data-count-card">
            <span className="data-count-value">{counts.categories}</span>
            <span className="data-count-label">Categories</span>
          </div>
        </div>
      )}

      {message && <p className="data-message">{message}</p>}

      <div className="card data-section">
        <h3>Re-analyze with AI</h3>
        <p className="data-reanalyze-hint">
          Re-run AI category suggestions over expenses already in your account — handy for anything imported before
          AI was set up, or left uncategorized.
        </p>

        {!aiReady ? (
          <p className="data-ai-nudge">
            Enable AI in <Link to="/settings">Settings</Link> first.
          </p>
        ) : (
          <>
            <div className="data-reanalyze-controls">
              <label>
                <input type="radio" checked={scope === 'uncategorized'} onChange={() => setScope('uncategorized')} />
                Only uncategorized expenses
              </label>
              <label>
                <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} />
                All expenses (double-checks existing categories too)
              </label>
              <button type="button" onClick={handleReanalyze} disabled={busy !== null}>
                {busy === 'reanalyze' ? 'Analyzing…' : 'Find suggestions'}
              </button>
            </div>
            {aiError && <p className="data-ai-error">{aiError}</p>}
          </>
        )}

        {suggestions.length > 0 && (
          <>
            <ul className="data-suggestion-list">
              {suggestions.map((s, i) => (
                <li key={s.expense.id}>
                  <input
                    type="checkbox"
                    checked={s.include}
                    onChange={(e) =>
                      setSuggestions((prev) => prev.map((p, j) => (j === i ? { ...p, include: e.target.checked } : p)))
                    }
                  />
                  <span className="data-suggestion-desc">{s.expense.description || '(no description)'}</span>
                  <span className="data-suggestion-change">
                    {categoryName(s.oldCategoryId)} → <strong>{categoryName(s.newCategoryId)}</strong>
                  </span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={applySuggestions} disabled={applying}>
              {applying ? 'Applying…' : `Apply ${suggestions.filter((s) => s.include).length} change(s)`}
            </button>
          </>
        )}
      </div>

      <div className="card data-danger-zone">
        <h3>Clean up</h3>
        <div className="data-action-row">
          <div>
            <strong>Remove exact duplicate expenses</strong>
            <p>Same date, amount, and description — usually from a statement accidentally imported twice.</p>
          </div>
          <button type="button" onClick={removeExactDuplicateExpenses} disabled={busy !== null}>
            {busy === 'dedupe' ? 'Working…' : 'Find & remove'}
          </button>
        </div>

        <div className="data-action-row">
          <div>
            <strong>Delete all statement imports</strong>
            <p>Clears imported statement files and their transaction records. Expenses already created stay.</p>
          </div>
          <button type="button" className="data-action-danger" onClick={deleteAllStatements} disabled={busy !== null}>
            {busy === 'statements' ? 'Working…' : 'Delete all'}
          </button>
        </div>

        <div className="data-action-row">
          <div>
            <strong>Delete all expenses</strong>
            <p>Wipes every expense record. Categories, bills, and goals are kept.</p>
          </div>
          <button type="button" className="data-action-danger" onClick={deleteAllExpenses} disabled={busy !== null}>
            {busy === 'expenses' ? 'Working…' : 'Delete all'}
          </button>
        </div>
      </div>
    </div>
  )
}
