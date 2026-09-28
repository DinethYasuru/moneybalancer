import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
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

export function Data() {
  const { user } = useAuth()
  const [counts, setCounts] = useState<Counts | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!user) return
    const [expenses, attachments, bankStatements, statementTransactions, recurringBills, goals, categories] = await Promise.all([
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
      categories: categories.count ?? 0,
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
