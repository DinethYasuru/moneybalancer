import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useCategories } from '../hooks/useCategories'
import { useRecurringBills } from '../hooks/useRecurringBills'
import type { Expense, RecurringBill } from '../lib/types'
import './MonthlyBills.css'

function currentMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)
  return { start, end }
}

export function MonthlyBills() {
  const { user } = useAuth()
  const { categories } = useCategories()
  const { bills, addBill, deleteBill } = useRecurringBills()
  const [monthExpenses, setMonthExpenses] = useState<Expense[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [payingBillId, setPayingBillId] = useState<string | null>(null)

  async function loadMonthExpenses() {
    if (!user) return
    const { start, end } = currentMonthRange()
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .not('recurring_bill_id', 'is', null)
      .gte('expense_date', start)
      .lt('expense_date', end)
    setMonthExpenses(data ?? [])
  }

  useEffect(() => {
    loadMonthExpenses()
  }, [user])

  const paymentFor = (billId: string) => monthExpenses.find((e) => e.recurring_bill_id === billId)

  return (
    <div className="monthly-bills">
      <div className="monthly-bills-header">
        <h2>Monthly bills</h2>
        <button type="button" onClick={() => setShowAddForm((v) => !v)}>
          {showAddForm ? 'Cancel' : '+ Add bill'}
        </button>
      </div>
      <p className="monthly-bills-hint">
        Set up your recurring bills once (rent, electricity, internet…). Each month, log the payment when it's due.
      </p>

      {showAddForm && (
        <AddBillForm
          categories={categories}
          onAdd={async (input) => {
            const { error } = await addBill(input)
            if (!error) setShowAddForm(false)
            return { error }
          }}
        />
      )}

      <ul className="bill-list">
        {bills.map((bill) => {
          const payment = paymentFor(bill.id)
          const category = categories.find((c) => c.id === bill.category_id)
          return (
            <li key={bill.id} className="card bill-row">
              <div className="bill-main">
                <span className="bill-chip" style={{ background: `${category?.color ?? '#6b7280'}22`, color: category?.color ?? '#6b7280' }}>
                  {category?.icon} {category?.name ?? 'Uncategorized'}
                </span>
                <span className="bill-name">{bill.name}</span>
                {bill.due_day && <span className="bill-due">Due day {bill.due_day}</span>}
                {bill.expected_amount != null && <span className="bill-expected">~{bill.expected_amount.toFixed(2)}</span>}
              </div>

              <div className="bill-status">
                {payment ? (
                  <span className="bill-paid">Paid {payment.expense_date} · {payment.amount.toFixed(2)}</span>
                ) : (
                  <span className="bill-unpaid">Not paid this month</span>
                )}

                {!payment && payingBillId !== bill.id && (
                  <button type="button" onClick={() => setPayingBillId(bill.id)}>
                    Log payment
                  </button>
                )}
                <button
                  type="button"
                  className="bill-delete"
                  onClick={async () => {
                    if (confirm(`Remove recurring bill "${bill.name}"? Past payments stay in your expense history.`)) {
                      await deleteBill(bill.id)
                    }
                  }}
                >
                  Remove
                </button>
              </div>

              {payingBillId === bill.id && (
                <LogPaymentForm
                  bill={bill}
                  onCancel={() => setPayingBillId(null)}
                  onLogged={async () => {
                    setPayingBillId(null)
                    await loadMonthExpenses()
                  }}
                />
              )}
            </li>
          )
        })}
      </ul>

      {bills.length === 0 && !showAddForm && <p className="monthly-bills-empty">No recurring bills yet. Add your rent, electricity, or internet bill to start tracking.</p>}
    </div>
  )
}

function AddBillForm({
  categories,
  onAdd,
}: {
  categories: { id: string; name: string; icon: string | null }[]
  onAdd: (input: { name: string; category_id: string | null; expected_amount: number | null; due_day: number | null }) => Promise<{ error: string | null }>
}) {
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [dueDay, setDueDay] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await onAdd({
      name: name.trim(),
      category_id: categoryId || null,
      expected_amount: amount ? Number(amount) : null,
      due_day: dueDay ? Number(dueDay) : null,
    })
    setSubmitting(false)
    if (error) setError(error)
  }

  return (
    <form className="card add-bill-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent" required />
      </label>
      <label>
        Category
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Expected amount
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="optional" />
      </label>
      <label>
        Due day of month
        <input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="optional" />
      </label>
      {error && <p className="monthly-bills-error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Adding…' : 'Add bill'}
      </button>
    </form>
  )
}

function LogPaymentForm({ bill, onCancel, onLogged }: { bill: RecurringBill; onCancel: () => void; onLogged: () => void }) {
  const { user } = useAuth()
  const [amount, setAmount] = useState(bill.expected_amount?.toString() ?? '')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.from('expenses').insert({
      user_id: user.id,
      category_id: bill.category_id,
      amount: Number(amount),
      description: bill.name,
      expense_date: date,
      is_recurring: true,
      recurring_bill_id: bill.id,
    })
    setSubmitting(false)
    if (error) {
      setError(error.message)
      return
    }
    onLogged()
  }

  return (
    <form className="log-payment-form" onSubmit={handleSubmit}>
      <label>
        Amount
        <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </label>
      <label>
        Date
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      {error && <p className="monthly-bills-error">{error}</p>}
      <div className="log-payment-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save payment'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
