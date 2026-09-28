import { useState, useEffect, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useDebts } from '../hooks/useDebts'
import { useCategories } from '../hooks/useCategories'
import {
  totalDebtBalance,
  totalMinimumPayments,
  planAvalanchePayoff,
  monthlyInterestCost,
  findPendingAutoDeductions,
} from '../lib/cashflow'
import type { Debt, DebtType, DeductionTrigger, Expense } from '../lib/types'
import './Debts.css'

const DEBT_TYPES: { value: DebtType; label: string; icon: string }[] = [
  { value: 'loan', label: 'Loan', icon: '🏦' },
  { value: 'credit_card', label: 'Credit card', icon: '💳' },
  { value: 'personal_lending', label: 'Borrowed from someone', icon: '🤝' },
  { value: 'other', label: 'Other', icon: '📄' },
]

function typeMeta(type: DebtType) {
  return DEBT_TYPES.find((t) => t.value === type) ?? DEBT_TYPES[3]
}

export function Debts() {
  const { debts, addDebt, logPayment, closeDebt } = useDebts()
  const { categories } = useCategories()
  const { user } = useAuth()
  const [showAddForm, setShowAddForm] = useState(false)
  const [payingDebtId, setPayingDebtId] = useState<string | null>(null)
  const [extraPayment, setExtraPayment] = useState('0')
  const [debtExpenses, setDebtExpenses] = useState<Expense[]>([])

  useEffect(() => {
    if (!user) return
    supabase
      .from('expenses')
      .select('*')
      .not('debt_id', 'is', null)
      .then(({ data }) => setDebtExpenses(data ?? []))
  }, [user])

  const totalBalance = totalDebtBalance(debts)
  const totalMinPayments = totalMinimumPayments(debts)
  const plan = planAvalanchePayoff(debts, Number(extraPayment) || 0)
  const planNoExtra = planAvalanchePayoff(debts, 0)
  const pendingDeductions = findPendingAutoDeductions(debts, debtExpenses)
  const pendingByDebtId = new Map(pendingDeductions.map((p) => [p.debt.id, p]))

  return (
    <div className="debts-page page-enter">
      <div className="debts-header">
        <h2>Loans &amp; credit cards</h2>
        <button type="button" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Cancel' : '+ Add debt'}
        </button>
      </div>
      <p className="debts-hint">
        Loans, credit cards, or money borrowed from people — track the balance and interest so you know exactly
        what it's costing you, and in what order to pay it off.
      </p>

      {debts.length > 0 && (
        <div className="debts-summary stagger">
          <div className="card debts-summary-card">
            <span className="debts-summary-label">Total owed</span>
            <span className="debts-summary-value debts-summary-danger">{totalBalance.toFixed(2)}</span>
          </div>
          <div className="card debts-summary-card">
            <span className="debts-summary-label">Minimum payments/mo</span>
            <span className="debts-summary-value">{totalMinPayments.toFixed(2)}</span>
          </div>
          <div className="card debts-summary-card">
            <span className="debts-summary-label">Interest cost/mo</span>
            <span className="debts-summary-value debts-summary-danger">
              {debts.reduce((sum, d) => sum + monthlyInterestCost(d), 0).toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {showAddForm && (
        <AddDebtForm
          onAdd={async (input) => {
            const { error } = await addDebt(input)
            if (!error) setShowAddForm(false)
            return { error }
          }}
        />
      )}

      <ul className="debt-list">
        {debts.map((debt) => {
          const meta = typeMeta(debt.debt_type)
          const monthlyInterest = monthlyInterestCost(debt)
          return (
            <li key={debt.id} className="card debt-row">
              <div className="debt-main">
                <span className="debt-type-chip">{meta.icon} {meta.label}</span>
                <span className="debt-name">{debt.name}</span>
                {debt.lender && <span className="debt-lender">{debt.lender}</span>}
                {debt.auto_deduct && (
                  <span className={`debt-auto-chip${pendingByDebtId.get(debt.id)?.isOverdue ? ' debt-auto-overdue' : ''}`}>
                    🔁 {debt.deduction_trigger === 'on_income' ? 'Auto-deducted from income' : `Auto-deducted, day ${debt.due_day}`}
                    {pendingByDebtId.has(debt.id) ? '' : ' · logged this month'}
                  </span>
                )}
              </div>

              <div className="debt-stats">
                <div>
                  <span className="debt-stat-label">Balance</span>
                  <span className="debt-stat-value debt-stat-danger">{debt.current_balance.toFixed(2)}</span>
                </div>
                {debt.interest_rate != null && (
                  <div>
                    <span className="debt-stat-label">Interest</span>
                    <span className="debt-stat-value">{debt.interest_rate}%/yr</span>
                  </div>
                )}
                {debt.minimum_payment != null && (
                  <div>
                    <span className="debt-stat-label">Min payment</span>
                    <span className="debt-stat-value">{debt.minimum_payment.toFixed(2)}</span>
                  </div>
                )}
                {monthlyInterest > 0 && (
                  <div>
                    <span className="debt-stat-label">Costs you/mo</span>
                    <span className="debt-stat-value debt-stat-danger">{monthlyInterest.toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="debt-actions">
                {payingDebtId !== debt.id && (
                  <button type="button" onClick={() => setPayingDebtId(debt.id)}>
                    Log payment
                  </button>
                )}
                <button
                  type="button"
                  className="debt-close"
                  onClick={() => {
                    if (confirm(`Mark "${debt.name}" as closed/paid off? It'll be removed from this list.`)) closeDebt(debt.id)
                  }}
                >
                  Mark paid off
                </button>
              </div>

              {payingDebtId === debt.id && (
                <LogDebtPaymentForm
                  debt={debt}
                  categories={categories}
                  onCancel={() => setPayingDebtId(null)}
                  onLogged={(catId, amount, date) => {
                    logPayment(debt.id, amount, date, catId)
                    setPayingDebtId(null)
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>

      {debts.length === 0 && !showAddForm && (
        <p className="debts-empty">No debts tracked. If you're debt-free, great — otherwise add a loan, credit card, or money you've borrowed above.</p>
      )}

      {debts.length > 1 && (
        <>
          <h3>Payoff plan (avalanche method)</h3>
          <div className="card payoff-plan">
            <p className="payoff-hint">
              Pay minimums on everything, throw every extra rupee at the highest-interest debt first — this clears
              your debt fastest and cheapest.
            </p>

            <ol className="payoff-order">
              {plan.order.map((d, i) => (
                <li key={d.id}>
                  <span className="payoff-rank">{i + 1}</span>
                  <span>{d.name}</span>
                  <span className="payoff-order-rate">{d.interest_rate ?? 0}%/yr</span>
                </li>
              ))}
            </ol>

            <label className="payoff-extra-label">
              Extra payment per month (on top of minimums)
              <input type="number" min="0" step="100" value={extraPayment} onChange={(e) => setExtraPayment(e.target.value)} />
            </label>

            <div className="payoff-results">
              <div>
                <span className="debts-stat-label">Debt-free in</span>
                <strong>{plan.monthsToDebtFree === null ? '—' : `${plan.monthsToDebtFree} months`}</strong>
              </div>
              {Number(extraPayment) > 0 && planNoExtra.monthsToDebtFree !== null && plan.monthsToDebtFree !== null && (
                <div className="payoff-savings">
                  <span className="debts-stat-label">vs minimums only</span>
                  <strong className="payoff-savings-value">
                    {planNoExtra.monthsToDebtFree - plan.monthsToDebtFree} months faster, saves ~
                    {(planNoExtra.totalInterestPaid - plan.totalInterestPaid).toFixed(2)} in interest
                  </strong>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AddDebtForm({
  onAdd,
}: {
  onAdd: (input: {
    name: string
    debt_type: DebtType
    lender: string | null
    principal_amount: number | null
    current_balance: number
    interest_rate: number | null
    minimum_payment: number | null
    due_day: number | null
    auto_deduct: boolean
    deduction_trigger: DeductionTrigger | null
  }) => Promise<{ error: string | null }>
}) {
  const [name, setName] = useState('')
  const [debtType, setDebtType] = useState<DebtType>('loan')
  const [lender, setLender] = useState('')
  const [balance, setBalance] = useState('')
  const [rate, setRate] = useState('')
  const [minPayment, setMinPayment] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [autoDeduct, setAutoDeduct] = useState(false)
  const [deductionTrigger, setDeductionTrigger] = useState<DeductionTrigger>('fixed_date')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await onAdd({
      name: name.trim(),
      debt_type: debtType,
      lender: lender.trim() || null,
      principal_amount: balance ? Number(balance) : null,
      current_balance: Number(balance),
      interest_rate: rate ? Number(rate) : null,
      minimum_payment: minPayment ? Number(minPayment) : null,
      due_day: dueDay ? Number(dueDay) : null,
      auto_deduct: autoDeduct,
      deduction_trigger: autoDeduct ? deductionTrigger : null,
    })
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <form className="card add-debt-form" onSubmit={handleSubmit}>
      <div className="add-debt-row">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Car loan" required />
        </label>
        <label>
          Type
          <select value={debtType} onChange={(e) => setDebtType(e.target.value as DebtType)}>
            {DEBT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.icon} {t.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="add-debt-row">
        <label>
          Lender / person
          <input value={lender} onChange={(e) => setLender(e.target.value)} placeholder="optional" />
        </label>
        <label>
          Current balance
          <input type="number" step="0.01" min="0" value={balance} onChange={(e) => setBalance(e.target.value)} required />
        </label>
      </div>
      <div className="add-debt-row">
        <label>
          Interest rate (%/yr)
          <input type="number" step="0.01" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0 if interest-free" />
        </label>
        <label>
          Minimum payment
          <input type="number" step="0.01" min="0" value={minPayment} onChange={(e) => setMinPayment(e.target.value)} placeholder="optional" />
        </label>
        <label>
          Due day
          <input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="optional" />
        </label>
      </div>

      <label className="add-debt-auto-toggle">
        <input type="checkbox" checked={autoDeduct} onChange={(e) => setAutoDeduct(e.target.checked)} />
        This payment happens automatically — I don't need to log it manually
      </label>

      {autoDeduct && (
        <div className="add-debt-trigger-row">
          <label className="add-debt-radio">
            <input
              type="radio"
              name="deduction_trigger"
              checked={deductionTrigger === 'fixed_date'}
              onChange={() => setDeductionTrigger('fixed_date')}
            />
            Deducted on a fixed date each month (uses due day above)
          </label>
          <label className="add-debt-radio">
            <input
              type="radio"
              name="deduction_trigger"
              checked={deductionTrigger === 'on_income'}
              onChange={() => setDeductionTrigger('on_income')}
            />
            Taken directly from my income when it arrives
          </label>
        </div>
      )}

      {error && <p className="debts-error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add debt'}
      </button>
    </form>
  )
}

function LogDebtPaymentForm({
  debt,
  categories,
  onCancel,
  onLogged,
}: {
  debt: Debt
  categories: { id: string; name: string }[]
  onCancel: () => void
  onLogged: (categoryId: string | null, amount: number, date: string) => void
}) {
  const [amount, setAmount] = useState(debt.minimum_payment?.toString() ?? '')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const debtCategory = categories.find((c) => c.name.toLowerCase().includes('debt')) ?? null

  return (
    <form
      className="log-debt-payment-form"
      onSubmit={(e) => {
        e.preventDefault()
        onLogged(debtCategory?.id ?? null, Number(amount), date)
      }}
    >
      <label>
        Amount
        <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <div className="log-debt-payment-actions">
        <button type="submit">Save payment</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
