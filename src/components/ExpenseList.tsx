import { useMemo, useState } from 'react'
import type { Category, Expense } from '../lib/types'
import './ExpenseList.css'

interface ExpenseListProps {
  expenses: Expense[]
  categories: Category[]
}

function toCsv(expenses: Expense[], categories: Category[]): string {
  const categoryName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized'
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const header = ['Date', 'Category', 'Description', 'Amount', 'Currency']
  const rows = expenses.map((e) => [e.expense_date, categoryName(e.category_id), e.description ?? '', e.amount.toFixed(2), e.currency])
  return [header, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(',')).join('\n')
}

export function ExpenseList({ expenses, categories }: ExpenseListProps) {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return expenses.filter((e) => {
      if (categoryFilter !== 'all' && (e.category_id ?? 'uncategorized') !== categoryFilter) return false
      if (q && !(e.description ?? '').toLowerCase().includes(q)) return false
      return true
    })
  }, [expenses, search, categoryFilter])

  const total = filtered.reduce((sum, e) => sum + e.amount, 0)

  function handleExport() {
    const csv = toCsv(filtered, categories)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="expense-list card">
      <div className="expense-list-header">
        <h2>Recent expenses</h2>
        <span className="expense-list-total">Total: {total.toFixed(2)}</span>
      </div>

      <div className="expense-list-filters">
        <input
          type="text"
          placeholder="Search description…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="expense-list-search"
        />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleExport} disabled={filtered.length === 0} className="expense-list-export">
          Export CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="expense-list-empty">
          {expenses.length === 0 ? 'No expenses yet. Add your first one above.' : 'No expenses match your filters.'}
        </p>
      ) : (
        <ul>
          {filtered.map((e) => {
            const cat = categoryOf(e.category_id)
            return (
              <li key={e.id}>
                <div className="expense-list-main">
                  <span
                    className="expense-list-category"
                    style={{ background: `${cat?.color ?? '#6b7280'}22`, color: cat?.color ?? '#6b7280' }}
                  >
                    {cat?.icon} {cat?.name ?? 'Uncategorized'}
                  </span>
                  <span className="expense-list-desc">{e.description}</span>
                </div>
                <div className="expense-list-meta">
                  <span>{e.expense_date}</span>
                  <span className="expense-list-amount">{e.currency} {e.amount.toFixed(2)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
