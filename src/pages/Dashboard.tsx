import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Expense } from '../lib/types'
import { useCategories } from '../hooks/useCategories'
import { useIncome } from '../hooks/useIncome'
import { useDebts } from '../hooks/useDebts'
import { useRecurringBills } from '../hooks/useRecurringBills'
import { useSavingsGoals } from '../hooks/useSavingsGoals'
import { useSettings } from '../hooks/useSettings'
import { analyzeExpenses } from '../lib/analysis'
import {
  totalMonthlyIncome,
  totalDebtBalance,
  debtToIncomeRatio,
  safeToSpendPerDay,
  findPendingAutoDeductions,
  totalPendingAutoDeductions,
  calculateHealthScore,
} from '../lib/cashflow'
import { getUpcomingPayments } from '../lib/upcoming'
import { formatMoney } from '../lib/format'
import { AnimatedNumber } from '../components/AnimatedNumber'
import { HealthScoreGauge } from '../components/HealthScoreGauge'
import { UpcomingPayments } from '../components/UpcomingPayments'
import './Dashboard.css'

export function Dashboard() {
  const { user } = useAuth()
  const { categories, loading: categoriesLoading } = useCategories()
  const { income } = useIncome()
  const { debts } = useDebts()
  const { bills } = useRecurringBills()
  const { goals } = useSavingsGoals()
  const { settings } = useSettings()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .limit(80)
      .then(({ data }) => {
        setExpenses(data ?? [])
        setLoading(false)
      })
  }, [user])

  if (loading || categoriesLoading) return <p>Loading…</p>

  const currency = settings.currency
  const money = (n: number) => formatMoney(n, currency)

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
  const upcoming = getUpcomingPayments(bills, debts, categories, expenses)
  const categoriesOverBudget = analysis.breakdown.filter((b) => b.budgetUsedPct !== null && b.budgetUsedPct >= 1).length
  const health = calculateHealthScore({ monthlyIncome, netThisMonth, dti, categoriesOverBudget })

  const now = new Date()
  const daysLeftInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
  const txnCountThisMonth = expenses.filter((e) => e.expense_date.slice(0, 7) === now.toISOString().slice(0, 7)).length

  return (
    <div className="dashboard page-enter">
      <div className="dashboard-top stagger">
        <HealthScoreGauge health={health} />
        <UpcomingPayments items={upcoming} currency={currency} />
        <div className="card dashboard-savings">
          <h3 className="dashboard-savings-title">Long-term savings</h3>
          {goals.length === 0 ? (
            <p className="dashboard-savings-empty">
              No savings goals yet — <Link to="/goals">set one up</Link> (emergency fund, a big purchase, anything).
            </p>
          ) : (
            <ul className="dashboard-savings-list">
              {goals.slice(0, 3).map((g) => {
                const pct = Math.min((g.current_amount / g.target_amount) * 100, 100)
                return (
                  <li key={g.id}>
                    <div className="dashboard-savings-row">
                      <span>{g.name}</span>
                      <span>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="dashboard-savings-bar">
                      <div className={`dashboard-savings-fill ${pct >= 100 ? 'goal-complete' : ''}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="dashboard-stats stagger">
        <div className="stat-card card card-hover">
          <span className="stat-label">This month</span>
          <span className="stat-value">
            <AnimatedNumber value={analysis.currentTotal} format={money} />
          </span>
        </div>
        <div className="stat-card card card-hover">
          <span className="stat-label">Top category</span>
          <span className="stat-value stat-value-sm">
            {topCategory ? `${topCategory.categoryName} · ${money(topCategory.currentTotal)}` : '—'}
          </span>
        </div>
        <div className="stat-card card card-hover">
          <span className="stat-label">vs last month</span>
          <span className={`stat-value ${analysis.totalChangePct !== null && analysis.totalChangePct > 0 ? 'stat-up' : 'stat-down'}`}>
            {analysis.totalChangePct === null ? '—' : `${(analysis.totalChangePct * 100).toFixed(0)}%`}
          </span>
        </div>

        {widgets.income && monthlyIncome > 0 && (
          <div className="stat-card card card-hover">
            <span className="stat-label">Remaining balance</span>
            <span className={`stat-value ${netThisMonth >= 0 ? 'stat-down' : 'stat-up'}`}>
              {netThisMonth >= 0 ? '+' : ''}
              <AnimatedNumber value={netThisMonth} format={money} />
            </span>
          </div>
        )}

        {widgets.safeToSpend && monthlyIncome > 0 && (
          <div className="stat-card card card-hover">
            <span className="stat-label">Safe to spend/day</span>
            <span className="stat-value">
              <AnimatedNumber value={safeToday} format={money} />
            </span>
            {committedNotYetLogged > 0 && <span className="stat-value-sub">{money(committedNotYetLogged)} set aside for auto-debits</span>}
          </div>
        )}

        {widgets.debt && debtBalance > 0 && (
          <div className="stat-card card card-hover">
            <span className="stat-label">Total debt</span>
            <span className="stat-value stat-up">
              <AnimatedNumber value={debtBalance} format={money} />
              {dti !== null && <span className="stat-value-sub"> · {dti.toFixed(0)}% of income</span>}
            </span>
          </div>
        )}
      </div>

      <div className="dashboard-minor-info stagger">
        <span>📅 {daysLeftInMonth} day{daysLeftInMonth === 1 ? '' : 's'} left this month</span>
        <span>🧾 {txnCountThisMonth} transaction{txnCountThisMonth === 1 ? '' : 's'} logged this month</span>
        {analysis.discretionaryTotal > 0 && <span>🎯 {money(analysis.discretionaryTotal)} spent on discretionary this month</span>}
      </div>

      {monthlyIncome === 0 && (
        <p className="dashboard-income-nudge">
          Add your income to see how much you actually have left to spend — <Link to="/income">set it up here</Link>.
        </p>
      )}

      <p className="dashboard-expenses-link">
        <Link to="/expenses">Add an expense or browse recent activity →</Link>
      </p>
    </div>
  )
}
