import type { RecurringBill, Debt, Expense, Category } from './types'

export interface UpcomingPayment {
  id: string
  name: string
  amount: number
  dueDay: number
  daysUntil: number
  isOverdue: boolean
  isPaid: boolean
  kind: 'bill' | 'debt'
  icon: string
  color: string
}

function daysUntilDue(dueDay: number, today: Date): { daysUntil: number; isOverdue: boolean } {
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const todayDay = today.getDate()
  if (dueDay >= todayDay) return { daysUntil: dueDay - todayDay, isOverdue: false }
  // Already past this month — either overdue (if unpaid) or due again next month.
  return { daysUntil: daysInMonth - todayDay + dueDay, isOverdue: true }
}

/**
 * Merges recurring bills and debts-with-a-due-day into one sorted "what's
 * coming up" timeline, checking real expense history to know what's
 * already been paid this month.
 */
export function getUpcomingPayments(
  bills: RecurringBill[],
  debts: Debt[],
  categories: Category[],
  monthExpenses: Expense[],
  referenceDate = new Date(),
): UpcomingPayment[] {
  const monthKey = referenceDate.toISOString().slice(0, 7)
  const paidBillIds = new Set(
    monthExpenses.filter((e) => e.recurring_bill_id && e.expense_date.slice(0, 7) === monthKey).map((e) => e.recurring_bill_id),
  )
  const paidDebtIds = new Set(monthExpenses.filter((e) => e.debt_id && e.expense_date.slice(0, 7) === monthKey).map((e) => e.debt_id))

  const items: UpcomingPayment[] = []

  for (const bill of bills) {
    if (!bill.due_day) continue
    const category = categories.find((c) => c.id === bill.category_id)
    const { daysUntil, isOverdue } = daysUntilDue(bill.due_day, referenceDate)
    items.push({
      id: bill.id,
      name: bill.name,
      amount: bill.expected_amount ?? 0,
      dueDay: bill.due_day,
      daysUntil,
      isOverdue: isOverdue && !paidBillIds.has(bill.id),
      isPaid: paidBillIds.has(bill.id),
      kind: 'bill',
      icon: category?.icon ?? '📄',
      color: category?.color ?? '#6b7280',
    })
  }

  for (const debt of debts) {
    if (!debt.due_day) continue
    const { daysUntil, isOverdue } = daysUntilDue(debt.due_day, referenceDate)
    items.push({
      id: debt.id,
      name: debt.name,
      amount: debt.minimum_payment ?? 0,
      dueDay: debt.due_day,
      daysUntil,
      isOverdue: isOverdue && !paidDebtIds.has(debt.id),
      isPaid: paidDebtIds.has(debt.id),
      kind: 'debt',
      icon: debt.debt_type === 'credit_card' ? '💳' : '🏦',
      color: '#f36a82',
    })
  }

  return items.sort((a, b) => {
    if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    return a.daysUntil - b.daysUntil
  })
}
