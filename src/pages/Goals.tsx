import { useState, type FormEvent } from 'react'
import { useSavingsGoals } from '../hooks/useSavingsGoals'
import { useSettings } from '../hooks/useSettings'
import { formatMoney } from '../lib/format'
import type { SavingsGoal } from '../lib/types'
import './Goals.css'

function monthsUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  const months = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth())
  return Math.max(months, 1)
}

export function Goals() {
  const { goals, addGoal, addContribution, deleteGoal } = useSavingsGoals()
  const { settings } = useSettings()
  const [name, setName] = useState('')
  const [targetAmount, setTargetAmount] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await addGoal({
      name: name.trim(),
      target_amount: Number(targetAmount),
      target_date: targetDate || null,
    })
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setName('')
    setTargetAmount('')
    setTargetDate('')
  }

  return (
    <div className="goals-page">
      <h2>Savings goals</h2>
      <p className="goals-hint">
        Set a target and we'll work out how much to set aside each month to hit it. Log contributions as you save
        toward it.
      </p>

      <form className="card goal-form" onSubmit={handleAdd}>
        <label>
          Goal name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund" required />
        </label>
        <label>
          Target amount
          <input type="number" step="0.01" min="0" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} required />
        </label>
        <label>
          Target date (optional)
          <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        </label>
        {error && <p className="goals-error">{error}</p>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add goal'}
        </button>
      </form>

      <ul className="goal-list">
        {goals.map((goal) => (
          <GoalRow
            key={goal.id}
            goal={goal}
            currency={settings.currency}
            onContribute={(amount) => addContribution(goal.id, amount)}
            onDelete={() => deleteGoal(goal.id)}
          />
        ))}
      </ul>

      {goals.length === 0 && <p className="goals-empty">No savings goals yet. Add one above to start tracking progress.</p>}
    </div>
  )
}

function GoalRow({
  goal,
  currency,
  onContribute,
  onDelete,
}: {
  goal: SavingsGoal
  currency: string
  onContribute: (amount: number) => void
  onDelete: () => void
}) {
  const [contribution, setContribution] = useState('')
  const money = (n: number) => formatMoney(n, currency)
  const pct = Math.min((goal.current_amount / goal.target_amount) * 100, 100)
  const remaining = Math.max(goal.target_amount - goal.current_amount, 0)
  const monthlyNeeded = goal.target_date && remaining > 0 ? remaining / monthsUntil(goal.target_date) : null

  return (
    <li className="card goal-row">
      <div className="goal-row-header">
        <span className="goal-name">{goal.name}</span>
        <button type="button" className="goal-delete" onClick={onDelete}>
          Remove
        </button>
      </div>

      <div className="goal-progress-bar">
        <div className={`goal-progress-fill ${pct >= 100 ? 'goal-complete' : ''}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="goal-progress-meta">
        <span>{money(goal.current_amount)} / {money(goal.target_amount)} ({pct.toFixed(0)}%)</span>
        {monthlyNeeded !== null && <span>Save ~{money(monthlyNeeded)}/month to hit your target date</span>}
      </div>

      <div className="goal-contribute">
        <input
          type="number"
          step="0.01"
          min="0"
          value={contribution}
          onChange={(e) => setContribution(e.target.value)}
          placeholder="Amount"
        />
        <button
          type="button"
          onClick={() => {
            if (contribution) {
              onContribute(Number(contribution))
              setContribution('')
            }
          }}
        >
          Add contribution
        </button>
      </div>
    </li>
  )
}
