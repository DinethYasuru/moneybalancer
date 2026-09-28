import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Expense } from '../lib/types'
import { useCategories } from '../hooks/useCategories'
import { analyzeExpenses } from '../lib/analysis'
import { ExpenseForm } from '../components/ExpenseForm'
import { ExpenseList } from '../components/ExpenseList'
import './Dashboard.css'

export function Dashboard() {
  const { user } = useAuth()
  const { categories, loading: categoriesLoading } = useCategories()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const loadExpenses = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .limit(50)
    setExpenses(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses((prev) => prev.filter((e) => e.id !== id))
  }

  if (loading || categoriesLoading) return <p>Loading…</p>

  const analysis = analyzeExpenses(expenses, categories)
  const topCategory = analysis.breakdown[0]

  return (
    <div className="dashboard">
      <div className="dashboard-stats">
        <div className="stat-card card">
          <span className="stat-label">This month</span>
          <span className="stat-value">{analysis.currentTotal.toFixed(2)}</span>
        </div>
        <div className="stat-card card">
          <span className="stat-label">Top category</span>
          <span className="stat-value stat-value-sm">
            {topCategory ? `${topCategory.categoryName} · ${topCategory.currentTotal.toFixed(2)}` : '—'}
          </span>
        </div>
        <div className="stat-card card">
          <span className="stat-label">vs last month</span>
          <span className={`stat-value ${analysis.totalChangePct !== null && analysis.totalChangePct > 0 ? 'stat-up' : 'stat-down'}`}>
            {analysis.totalChangePct === null ? '—' : `${(analysis.totalChangePct * 100).toFixed(0)}%`}
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <ExpenseForm categories={categories} onSaved={loadExpenses} />
        <ExpenseList expenses={expenses} categories={categories} onDelete={deleteExpense} />
      </div>
    </div>
  )
}
