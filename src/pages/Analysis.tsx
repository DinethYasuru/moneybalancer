import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { useIncome } from '../hooks/useIncome'
import { useDebts } from '../hooks/useDebts'
import { analyzeExpenses, generateInsights, type Insight, type InsightType } from '../lib/analysis'
import { generateCashflowInsights } from '../lib/cashflow'
import { InsightCards } from '../components/InsightCards'
import { useSettings } from '../hooks/useSettings'
import { formatMoney } from '../lib/format'
import type { Expense } from '../lib/types'
import './Analysis.css'

const SEVERITY: Record<InsightType, number> = { danger: 0, warning: 1, tip: 2, success: 3 }

export function Analysis() {
  const { user } = useAuth()
  const { categories } = useCategories()
  const { income } = useIncome()
  const { debts } = useDebts()
  const { settings } = useSettings()
  const money = (n: number) => formatMoney(n, settings.currency)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase
      .from('expenses')
      .select('*')
      .then(({ data }) => {
        setExpenses(data ?? [])
        setLoading(false)
      })
  }, [user])

  if (loading) return <p>Loading…</p>

  const analysis = analyzeExpenses(expenses, categories)
  const cashflowInsights = generateCashflowInsights(income, debts, expenses, analysis.currentTotal)
  const insights: Insight[] = [...cashflowInsights, ...generateInsights(expenses, categories)].sort(
    (a, b) => SEVERITY[a.type] - SEVERITY[b.type],
  )
  const essentialPct = analysis.currentTotal > 0 ? (analysis.essentialTotal / analysis.currentTotal) * 100 : 0
  const discretionaryPct = 100 - essentialPct
  const budgeted = analysis.breakdown.filter((b) => b.monthlyBudget != null)

  return (
    <div className="analysis page-enter">
      <h2>Financial analysis</h2>

      <div className="analysis-summary">
        <div className="analysis-summary-card">
          <span className="analysis-label">{analysis.currentMonthLabel}</span>
          <span className="analysis-value">{money(analysis.currentTotal)}</span>
        </div>
        <div className="analysis-summary-card">
          <span className="analysis-label">{analysis.previousMonthLabel}</span>
          <span className="analysis-value">{money(analysis.previousTotal)}</span>
        </div>
        <div className="analysis-summary-card">
          <span className="analysis-label">Change</span>
          <span className={`analysis-value ${analysis.totalChangePct !== null && analysis.totalChangePct > 0 ? 'analysis-up' : 'analysis-down'}`}>
            {analysis.totalChangePct === null ? '—' : `${(analysis.totalChangePct * 100).toFixed(0)}%`}
          </span>
        </div>
      </div>

      <h3>Insights</h3>
      <InsightCards insights={insights} />

      <h3>Essential vs discretionary</h3>
      <div className="essential-split card">
        <div className="essential-split-bar">
          <div className="essential-split-fill" style={{ width: `${essentialPct}%` }} />
        </div>
        <div className="essential-split-legend">
          <span><span className="dot dot-essential" /> Essential {money(analysis.essentialTotal)} ({essentialPct.toFixed(0)}%)</span>
          <span><span className="dot dot-discretionary" /> Discretionary {money(analysis.discretionaryTotal)} ({discretionaryPct.toFixed(0)}%)</span>
        </div>
      </div>

      {budgeted.length > 0 && (
        <>
          <h3>Budgets this month</h3>
          <ul className="budget-progress-list">
            {budgeted.map((b) => (
              <li key={b.categoryId} className="card">
                <div className="budget-progress-header">
                  <span>{b.categoryName}</span>
                  <span>{money(b.currentTotal)} / {money(b.monthlyBudget!)}</span>
                </div>
                <div className="budget-progress-bar">
                  <div
                    className={`budget-progress-fill ${b.budgetUsedPct! >= 1 ? 'over-budget' : b.budgetUsedPct! >= 0.85 ? 'near-budget' : ''}`}
                    style={{ width: `${Math.min(b.budgetUsedPct! * 100, 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>By category — this month vs last</h3>
      <div className="analysis-table-wrapper">
        <table className="analysis-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>This month</th>
              <th>Last month</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {analysis.breakdown.map((b) => (
              <tr key={b.categoryId ?? 'uncategorized'}>
                <td>{b.categoryName}</td>
                <td>{money(b.currentTotal)}</td>
                <td>{money(b.previousTotal)}</td>
                <td className={b.changeAmount > 0 ? 'analysis-up' : b.changeAmount < 0 ? 'analysis-down' : ''}>
                  {b.changePct === null ? '—' : `${(b.changePct * 100).toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
