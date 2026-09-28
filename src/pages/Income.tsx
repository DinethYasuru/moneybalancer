import { useState, type FormEvent } from 'react'
import { useIncome, monthlyEquivalent } from '../hooks/useIncome'
import { totalMonthlyIncome, oneTimeIncomeThisMonth } from '../lib/cashflow'
import type { IncomeFrequency } from '../lib/types'
import './Income.css'

const FREQUENCIES: { value: IncomeFrequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'one_time', label: 'One-time' },
]

export function Income() {
  const { income, addIncome, deleteIncome } = useIncome()
  const [source, setSource] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<IncomeFrequency>('monthly')
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const monthlyTotal = totalMonthlyIncome(income)
  const oneTimeThisMonth = oneTimeIncomeThisMonth(income)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await addIncome({
      source: source.trim(),
      amount: Number(amount),
      frequency,
      received_date: receivedDate,
      is_recurring: frequency !== 'one_time',
    })
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setSource('')
    setAmount('')
  }

  return (
    <div className="income-page page-enter">
      <h2>Income</h2>
      <p className="income-hint">
        Track what actually comes in — salary, side gigs, anything. Without this, "savings" is just a guess.
      </p>

      <div className="income-summary stagger">
        <div className="card income-summary-card">
          <span className="income-summary-label">Recurring monthly income</span>
          <span className="income-summary-value">{monthlyTotal.toFixed(2)}</span>
        </div>
        <div className="card income-summary-card">
          <span className="income-summary-label">One-time this month</span>
          <span className="income-summary-value">{oneTimeThisMonth.toFixed(2)}</span>
        </div>
      </div>

      <form className="card income-form" onSubmit={handleSubmit}>
        <label>
          Source
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Salary, Freelance" required />
        </label>
        <label>
          Amount
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </label>
        <label>
          Frequency
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as IncomeFrequency)}>
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
        </label>
        {error && <p className="income-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add income'}
        </button>
      </form>

      <ul className="income-list">
        {income.map((i) => (
          <li key={i.id} className="card">
            <div className="income-row-main">
              <span className="income-source">{i.source}</span>
              <span className="income-freq">
                {i.is_recurring ? `${FREQUENCIES.find((f) => f.value === i.frequency)?.label} · ~${monthlyEquivalent(i.amount, i.frequency).toFixed(2)}/mo` : 'One-time'}
              </span>
            </div>
            <div className="income-row-meta">
              <span>{i.received_date}</span>
              <span className="income-amount">{i.amount.toFixed(2)}</span>
              <button type="button" className="income-delete" onClick={() => deleteIncome(i.id)} aria-label="Delete">
                ×
              </button>
            </div>
          </li>
        ))}
      </ul>

      {income.length === 0 && <p className="income-empty">No income logged yet. Add your salary or main income source above.</p>}
    </div>
  )
}
