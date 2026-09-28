import type { Debt, Expense, Income } from './types'
import type { Insight } from './analysis'
import { monthlyEquivalent } from '../hooks/useIncome'

/** Monthly interest cost estimate from an annual rate — what the debt costs just sitting there. */
export function monthlyInterestCost(debt: Pick<Debt, 'current_balance' | 'interest_rate'>): number {
  if (!debt.interest_rate) return 0
  return (debt.current_balance * (debt.interest_rate / 100)) / 12
}

/** Total recurring monthly income, normalizing weekly/biweekly to a monthly figure. One-time entries don't count toward the recurring baseline. */
export function totalMonthlyIncome(income: Income[]): number {
  return income.filter((i) => i.is_recurring).reduce((sum, i) => sum + monthlyEquivalent(i.amount, i.frequency), 0)
}

/** One-time income received this calendar month (bonuses, gifts, etc.), added on top of the recurring baseline. */
export function oneTimeIncomeThisMonth(income: Income[], referenceDate = new Date()): number {
  const key = referenceDate.toISOString().slice(0, 7)
  return income.filter((i) => !i.is_recurring && i.received_date.slice(0, 7) === key).reduce((sum, i) => sum + i.amount, 0)
}

export function totalDebtBalance(debts: Debt[]): number {
  return debts.reduce((sum, d) => sum + d.current_balance, 0)
}

export function totalMinimumPayments(debts: Debt[]): number {
  return debts.reduce((sum, d) => sum + (d.minimum_payment ?? 0), 0)
}

/** Debt-to-income ratio as a percentage of monthly income committed to minimum debt payments — a standard lender stress signal. */
export function debtToIncomeRatio(debts: Debt[], monthlyIncome: number): number | null {
  if (monthlyIncome <= 0) return null
  return (totalMinimumPayments(debts) / monthlyIncome) * 100
}

/** How much is left to spend per remaining day this month before you'd be spending more than you earn. */
export function safeToSpendPerDay(monthlyIncome: number, spentSoFarThisMonth: number, referenceDate = new Date()): number {
  const daysInMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate()
  const daysRemaining = Math.max(daysInMonth - referenceDate.getDate() + 1, 1)
  const remaining = monthlyIncome - spentSoFarThisMonth
  return Math.max(remaining / daysRemaining, 0)
}

export interface PendingAutoDeduction {
  debt: Debt
  amount: number
  isOverdue: boolean
}

/**
 * Auto-debited loan/credit payments (fixed date, or taken straight from
 * salary) leave your account whether or not you've manually logged an
 * expense for them. This finds ones due this month that haven't been
 * logged yet, so they can still be counted against "safe to spend" and
 * flagged if they look overdue.
 */
export function findPendingAutoDeductions(debts: Debt[], expenses: Expense[], referenceDate = new Date()): PendingAutoDeduction[] {
  const monthKey = referenceDate.toISOString().slice(0, 7)
  const loggedDebtIds = new Set(expenses.filter((e) => e.debt_id && e.expense_date.slice(0, 7) === monthKey).map((e) => e.debt_id))

  const pending: PendingAutoDeduction[] = []
  for (const debt of debts) {
    if (!debt.auto_deduct || !debt.minimum_payment || loggedDebtIds.has(debt.id)) continue
    const isOverdue = debt.deduction_trigger === 'fixed_date' && !!debt.due_day && debt.due_day < referenceDate.getDate()
    pending.push({ debt, amount: debt.minimum_payment, isOverdue })
  }
  return pending
}

export function totalPendingAutoDeductions(pending: PendingAutoDeduction[]): number {
  return pending.reduce((sum, p) => sum + p.amount, 0)
}

export interface PayoffPlan {
  order: Debt[]
  monthsToDebtFree: number | null // null if minimum payments never clear it (interest exceeds payments)
  totalInterestPaid: number
}

/**
 * Avalanche method: pay minimums on everything, throw all extra at the
 * highest-interest debt first. Simulated month by month rather than solved
 * analytically, since minimum payments vary per debt.
 */
export function planAvalanchePayoff(debts: Debt[], extraMonthlyPayment = 0): PayoffPlan {
  const order = [...debts].sort((a, b) => (b.interest_rate ?? 0) - (a.interest_rate ?? 0))
  if (order.length === 0) return { order, monthsToDebtFree: 0, totalInterestPaid: 0 }

  const balances = order.map((d) => d.current_balance)
  const rates = order.map((d) => (d.interest_rate ?? 0) / 100 / 12)
  const minPayments = order.map((d) => d.minimum_payment ?? 0)

  let months = 0
  let totalInterest = 0
  const MAX_MONTHS = 600 // 50 years — treat anything longer as "won't clear"

  while (balances.some((b) => b > 0.01) && months < MAX_MONTHS) {
    let extra = extraMonthlyPayment
    for (let i = 0; i < balances.length; i++) {
      if (balances[i] <= 0) continue
      const interest = balances[i] * rates[i]
      totalInterest += interest
      balances[i] += interest
      const payment = Math.min(minPayments[i], balances[i])
      balances[i] -= payment
    }
    // After minimums, throw all extra at the first (highest-interest) unpaid debt.
    for (let i = 0; i < balances.length && extra > 0; i++) {
      if (balances[i] <= 0) continue
      const payment = Math.min(extra, balances[i])
      balances[i] -= payment
      extra -= payment
    }
    months++
  }

  const cleared = balances.every((b) => b <= 0.01)
  return { order, monthsToDebtFree: cleared ? months : null, totalInterestPaid: totalInterest }
}

/**
 * Insights that only make sense once income and debt are known — the
 * "are you actually okay" signals a pure expense tracker can't give you.
 */
export function generateCashflowInsights(income: Income[], debts: Debt[], expenses: Expense[], monthlyExpenseTotal: number): Insight[] {
  const insights: Insight[] = []
  const monthlyIncome = totalMonthlyIncome(income)

  const pendingDeductions = findPendingAutoDeductions(debts, expenses)
  for (const p of pendingDeductions) {
    if (p.isOverdue) {
      insights.push({
        id: `auto-deduct-overdue-${p.debt.id}`,
        type: 'warning',
        icon: '⏰',
        headline: `${p.debt.name} auto-payment overdue?`,
        detail: `Was due on day ${p.debt.due_day} but no payment is logged this month. If it went through automatically, log it to keep your balance accurate.`,
      })
    } else {
      insights.push({
        id: `auto-deduct-pending-${p.debt.id}`,
        type: 'tip',
        icon: '🔁',
        headline: `${p.debt.name} will auto-deduct ${p.amount.toFixed(2)}`,
        detail:
          p.debt.deduction_trigger === 'on_income'
            ? "Taken directly from your income when it arrives — already counted against your safe-to-spend."
            : `Due on day ${p.debt.due_day} — already counted against your safe-to-spend.`,
      })
    }
  }

  if (monthlyIncome > 0 && monthlyExpenseTotal > monthlyIncome) {
    insights.push({
      id: 'overspending-income',
      type: 'danger',
      icon: '📉',
      headline: "You're spending more than you earn",
      detail: `${monthlyExpenseTotal.toFixed(2)} spent vs ${monthlyIncome.toFixed(2)} income this month. That gap has to come from savings or more debt.`,
    })
  }

  const dti = debtToIncomeRatio(debts, monthlyIncome)
  if (dti !== null && dti >= 40) {
    insights.push({
      id: 'high-dti',
      type: 'danger',
      icon: '⚖️',
      headline: 'Debt load is high',
      detail: `${dti.toFixed(0)}% of your income goes to minimum debt payments. Lenders start worrying above 40%.`,
    })
  } else if (dti !== null && dti >= 25) {
    insights.push({
      id: 'moderate-dti',
      type: 'warning',
      icon: '⚖️',
      headline: 'Debt is a meaningful chunk of income',
      detail: `${dti.toFixed(0)}% of monthly income goes to minimum debt payments.`,
    })
  }

  const costliestDebt = [...debts].sort((a, b) => monthlyInterestCost(b) - monthlyInterestCost(a))[0]
  if (costliestDebt) {
    const cost = monthlyInterestCost(costliestDebt)
    if (cost >= 500) {
      insights.push({
        id: `interest-cost-${costliestDebt.id}`,
        type: 'tip',
        icon: '🔥',
        headline: `${costliestDebt.name} is bleeding interest`,
        detail: `Costing you roughly ${cost.toFixed(2)}/month in interest alone, just sitting there. Paying it down faster saves real money.`,
      })
    }
  }

  return insights
}
