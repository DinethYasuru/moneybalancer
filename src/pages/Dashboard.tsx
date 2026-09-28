import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Expense } from '../lib/types'
import { useCategories } from '../hooks/useCategories'
import { useIncome } from '../hooks/useIncome'
import { useDebts } from '../hooks/useDebts'
import { useSettings } from '../hooks/useSettings'
import { analyzeExpenses } from '../lib/analysis'
import { totalMonthlyIncome, totalDebtBalance, debtToIncomeRatio, safeToSpendPerDay, findPendingAutoDeductions, totalPendingAutoDeductions } from '../lib/cashflow'
import { ExpenseForm } from '../components/ExpenseForm'
import { ExpenseList } from '../components/ExpenseList'
import './Dashboard.css'

export function Dashboard() {
  const { user } = useAuth()
  const { categories, loading: categoriesLoading } = useCategories()
  const { income } = useIncome()
  const { debts } = useDebts()
  const { settings } = useSettings()
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
  const monthlyIncome = totalMonthlyIncome(income)
  const debtBalance = totalDebtBalance(debts)
  const dti = debtToIncomeRatio(debts, monthlyIncome)
  const pendingAutoDeductions = findPendingAutoDeductions(debts, expenses)
  const committedNotYetLogged = totalPendingAutoDeductions(pendingAutoDeductions)
  const safeToday = safeToSpendPerDay(monthlyIncome, analysis.currentTotal + committedNotYetLogged)
  const netThisMonth = monthlyIncome - analysis.currentTotal
  const widgets = settings.dashboard_widgets

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

        {widgets.income && monthlyIncome > 0 && (
          <div className="stat-card card">
            <span className="stat-label">Net this month</span>
            <span className={`stat-value ${netThisMonth >= 0 ? 'stat-down' : 'stat-up'}`}>
              {netThisMonth >= 0 ? '+' : ''}{netThisMonth.toFixed(2)}
            </span>
          </div>
        )}

        {widgets.safeToSpend && monthlyIncome > 0 && (
          <div className="stat-card card">
            <span className="stat-label">Safe to spend/day</span>
            <span className="stat-value">{safeToday.toFixed(2)}</span>
            {committedNotYetLogged > 0 && (
              <span className="stat-value-sub">{committedNotYetLogged.toFixed(2)} set aside for auto-debits</span>
            )}
          </div>
        )}

        {widgets.debt && debtBalance > 0 && (
          <div className="stat-card card">
            <span className="stat-label">Total debt</span>
            <span className="stat-value stat-up">
              {debtBalance.toFixed(2)}
              {dti !== null && <span className="stat-value-sub"> · {dti.toFixed(0)}% of income</span>}
            </span>
          </div>
        )}
      </div>

      {monthlyIncome === 0 && (
        <p className="dashboard-income-nudge">
          Add your income to see how much you actually have left to spend — <Link to="/income">set it up here</Link>.
        </p>
      )}

      <div className="dashboard-grid">
        <ExpenseForm categories={categories} onSaved={loadExpenses} />
        <ExpenseList expenses={expenses} categories={categories} onDelete={deleteExpense} />
      </div>
    </div>
  )
}
