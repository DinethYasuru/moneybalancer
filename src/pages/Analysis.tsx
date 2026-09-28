import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { analyzeExpenses } from '../lib/analysis'
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

      <h3>Suggestions</h3>
      <ul className="analysis-suggestions">
        {analysis.suggestions.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>

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
