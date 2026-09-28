import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { analyzeExpenses, findFrequentSmallSpends, listSubscriptions, findPossibleDuplicates } from '../lib/analysis'
import type { Expense } from '../lib/types'
import './Analysis.css'

export function Analysis() {
  const { user } = useAuth()
  const { categories } = useCategories()
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
  const frequentSmallSpends = findFrequentSmallSpends(expenses, categories)
  const subscriptions = listSubscriptions(expenses, categories)
  const duplicates = findPossibleDuplicates(expenses)
  const essentialPct = analysis.currentTotal > 0 ? (analysis.essentialTotal / analysis.currentTotal) * 100 : 0
  const discretionaryPct = 100 - essentialPct
  const budgeted = analysis.breakdown.filter((b) => b.monthlyBudget != null)

  return (
    <div className="analysis">
      <h2>Financial analysis</h2>

      <div className="analysis-summary">
        <div className="analysis-summary-card">
          <span className="analysis-label">{analysis.currentMonthLabel}</span>
          <span className="analysis-value">{analysis.currentTotal.toFixed(2)}</span>
        </div>
        <div className="analysis-summary-card">
          <span className="analysis-label">{analysis.previousMonthLabel}</span>
          <span className="analysis-value">{analysis.previousTotal.toFixed(2)}</span>
        </div>
        <div className="analysis-summary-card">
          <span className="analysis-label">Change</span>
          <span className={`analysis-value ${analysis.totalChangePct !== null && analysis.totalChangePct > 0 ? 'analysis-up' : 'analysis-down'}`}>
            {analysis.totalChangePct === null ? '—' : `${(analysis.totalChangePct * 100).toFixed(0)}%`}
          </span>
        </div>
      </div>

      <h3>Essential vs discretionary</h3>
      <div className="essential-split card">
        <div className="essential-split-bar">
          <div className="essential-split-fill" style={{ width: `${essentialPct}%` }} />
        </div>
        <div className="essential-split-legend">
          <span><span className="dot dot-essential" /> Essential {analysis.essentialTotal.toFixed(2)} ({essentialPct.toFixed(0)}%)</span>
          <span><span className="dot dot-discretionary" /> Discretionary {analysis.discretionaryTotal.toFixed(2)} ({discretionaryPct.toFixed(0)}%)</span>
        </div>
      </div>

      <h3>Suggestions</h3>
      <ul className="analysis-suggestions">
        {analysis.suggestions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

      {budgeted.length > 0 && (
        <>
          <h3>Budgets this month</h3>
          <ul className="budget-progress-list">
            {budgeted.map((b) => (
              <li key={b.categoryId} className="card">
                <div className="budget-progress-header">
                  <span>{b.categoryName}</span>
                  <span>{b.currentTotal.toFixed(2)} / {b.monthlyBudget!.toFixed(2)}</span>
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

      {frequentSmallSpends.length > 0 && (
        <>
          <h3>Frequent small purchases (possible waste)</h3>
          <ul className="analysis-suggestions">
            {frequentSmallSpends.map((f) => (
              <li key={f.categoryName}>
                {f.categoryName}: {f.count} separate purchases totaling {f.total.toFixed(2)} (avg {f.average.toFixed(2)} each) this month.
              </li>
            ))}
          </ul>
        </>
      )}

      {subscriptions.length > 0 && (
        <>
          <h3>Recurring subscriptions</h3>
          <ul className="analysis-suggestions">
            {subscriptions.map((s) => (
              <li key={s.description}>
                {s.description}: {s.monthlyAmount.toFixed(2)} · charged {s.occurrences} time{s.occurrences === 1 ? '' : 's'}, last on {s.lastChargedDate}. Still using this?
              </li>
            ))}
          </ul>
        </>
      )}

      {duplicates.length > 0 && (
        <>
          <h3>Possible duplicate charges</h3>
          <ul className="analysis-suggestions analysis-warning-list">
            {duplicates.map((d, i) => (
              <li key={i}>
                {d.description}: {d.amount.toFixed(2)} charged on both {d.dates[0]} and {d.dates[1]} — check this isn't a double charge.
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
                <td>{b.currentTotal.toFixed(2)}</td>
                <td>{b.previousTotal.toFixed(2)}</td>
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
