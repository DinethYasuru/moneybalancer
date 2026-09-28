import type { Category, Expense } from './types'

export interface CategoryBreakdown {
  categoryId: string | null
  categoryName: string
  currentTotal: number
  previousTotal: number
  changeAmount: number
  changePct: number | null // null when previous was 0 (can't compute a meaningful %)
  monthlyBudget: number | null
  budgetUsedPct: number | null
  isEssential: boolean
}

export interface MonthlyAnalysis {
  currentMonthLabel: string
  previousMonthLabel: string
  currentTotal: number
  previousTotal: number
  totalChangePct: number | null
  breakdown: CategoryBreakdown[]
  suggestions: string[]
  essentialTotal: number
  discretionaryTotal: number
}

function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7) // yyyy-mm
}

function monthLabel(dateStr: string): string {
  const [y, m] = dateStr.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

const GROWTH_FLAG_THRESHOLD = 0.2 // 20%
const MIN_AMOUNT_FOR_FLAG = 500 // ignore noise on tiny categories

export function analyzeExpenses(expenses: Expense[], categories: Category[], referenceDate = new Date()): MonthlyAnalysis {
  const currentKey = referenceDate.toISOString().slice(0, 7)
  const prev = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1)
  const previousKey = prev.toISOString().slice(0, 7)

  const currentByCategory = new Map<string, number>()
  const previousByCategory = new Map<string, number>()
  let currentTotal = 0
  let previousTotal = 0

  for (const e of expenses) {
    const key = monthKey(e.expense_date)
    const catId = e.category_id ?? 'uncategorized'
    if (key === currentKey) {
      currentByCategory.set(catId, (currentByCategory.get(catId) ?? 0) + e.amount)
      currentTotal += e.amount
    } else if (key === previousKey) {
      previousByCategory.set(catId, (previousByCategory.get(catId) ?? 0) + e.amount)
      previousTotal += e.amount
    }
  }

  const categoryOf = (id: string) => categories.find((c) => c.id === id)

  const allCategoryIds = new Set([...currentByCategory.keys(), ...previousByCategory.keys()])
  const breakdown: CategoryBreakdown[] = Array.from(allCategoryIds).map((id) => {
    const current = currentByCategory.get(id) ?? 0
    const previous = previousByCategory.get(id) ?? 0
    const changeAmount = current - previous
    const changePct = previous > 0 ? changeAmount / previous : null
    const category = id === 'uncategorized' ? null : categoryOf(id)
    return {
      categoryId: id === 'uncategorized' ? null : id,
      categoryName: category?.name ?? 'Uncategorized',
      currentTotal: current,
      previousTotal: previous,
      changeAmount,
      changePct,
      monthlyBudget: category?.monthly_budget ?? null,
      budgetUsedPct: category?.monthly_budget ? current / category.monthly_budget : null,
      isEssential: category?.is_essential ?? true,
    }
  })

  breakdown.sort((a, b) => b.currentTotal - a.currentTotal)

  let essentialTotal = 0
  let discretionaryTotal = 0
  for (const b of breakdown) {
    if (b.isEssential) essentialTotal += b.currentTotal
    else discretionaryTotal += b.currentTotal
  }

  const suggestions: string[] = []
  for (const b of breakdown) {
    if (b.currentTotal < MIN_AMOUNT_FOR_FLAG) continue
    if (b.changePct !== null && b.changePct >= GROWTH_FLAG_THRESHOLD) {
      suggestions.push(
        `${b.categoryName} is up ${(b.changePct * 100).toFixed(0)}% vs last month (${b.previousTotal.toFixed(2)} → ${b.currentTotal.toFixed(2)}). Worth checking what changed.`,
      )
    }
  }

  for (const b of breakdown) {
    if (b.budgetUsedPct !== null && b.budgetUsedPct >= 1) {
      suggestions.push(
        `${b.categoryName} is over budget: ${b.currentTotal.toFixed(2)} spent against a ${b.monthlyBudget!.toFixed(2)} limit.`,
      )
    } else if (b.budgetUsedPct !== null && b.budgetUsedPct >= 0.85) {
      suggestions.push(`${b.categoryName} is at ${(b.budgetUsedPct * 100).toFixed(0)}% of its budget — close to the limit.`)
    }
  }

  const droppedCategories = breakdown.filter((b) => b.previousTotal >= MIN_AMOUNT_FOR_FLAG && b.currentTotal === 0)
  for (const b of droppedCategories) {
    suggestions.push(`${b.categoryName} had no spending this month, down from ${b.previousTotal.toFixed(2)} last month — nice.`)
  }

  if (currentTotal > 0 && previousTotal > 0) {
    const overallChange = (currentTotal - previousTotal) / previousTotal
    if (overallChange >= 0.15) {
      suggestions.push(`Total spending is up ${(overallChange * 100).toFixed(0)}% overall this month.`)
    } else if (overallChange <= -0.15) {
      suggestions.push(`Total spending is down ${Math.abs(overallChange * 100).toFixed(0)}% overall this month — good progress.`)
    }
  }

  if (suggestions.length === 0) {
    suggestions.push('No unusual spending changes detected this month.')
  }

  return {
    currentMonthLabel: monthLabel(`${currentKey}-01`),
    previousMonthLabel: monthLabel(`${previousKey}-01`),
    currentTotal,
    previousTotal,
    totalChangePct: previousTotal > 0 ? (currentTotal - previousTotal) / previousTotal : null,
    breakdown,
    suggestions,
    essentialTotal,
    discretionaryTotal,
  }
}

export interface FrequentSmallSpend {
  categoryName: string
  count: number
  total: number
  average: number
}

const SMALL_SPEND_THRESHOLD = 1500
const SMALL_SPEND_MIN_COUNT = 4

/**
 * Small, frequent purchases in discretionary categories are the classic
 * "death by a thousand cuts" pattern — individually easy to ignore, but
 * they add up. Essential categories (groceries, bills) are excluded since
 * frequent small spending there is normal, not waste.
 */
export function findFrequentSmallSpends(expenses: Expense[], categories: Category[], referenceDate = new Date()): FrequentSmallSpend[] {
  const currentKey = referenceDate.toISOString().slice(0, 7)
  const discretionaryIds = new Set(categories.filter((c) => !c.is_essential).map((c) => c.id))

  const groups = new Map<string, Expense[]>()
  for (const e of expenses) {
    if (monthKey(e.expense_date) !== currentKey) continue
    if (!e.category_id || !discretionaryIds.has(e.category_id)) continue
    if (e.amount > SMALL_SPEND_THRESHOLD) continue
    const list = groups.get(e.category_id) ?? []
    list.push(e)
    groups.set(e.category_id, list)
  }

  const results: FrequentSmallSpend[] = []
  for (const [categoryId, list] of groups) {
    if (list.length < SMALL_SPEND_MIN_COUNT) continue
    const total = list.reduce((sum, e) => sum + e.amount, 0)
    results.push({
      categoryName: categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized',
      count: list.length,
      total,
      average: total / list.length,
    })
  }

  return results.sort((a, b) => b.total - a.total)
}

export interface SubscriptionSummary {
  description: string
  monthlyAmount: number
  lastChargedDate: string
  occurrences: number
}

/**
 * Lists distinct recurring charges in the Subscriptions category so the
 * user can spot ones they forgot they were paying for.
 */
export function listSubscriptions(expenses: Expense[], categories: Category[]): SubscriptionSummary[] {
  const subsCategory = categories.find((c) => c.name.toLowerCase() === 'subscriptions')
  if (!subsCategory) return []

  const groups = new Map<string, Expense[]>()
  for (const e of expenses) {
    if (e.category_id !== subsCategory.id) continue
    const key = (e.description ?? 'Subscription').trim().toLowerCase()
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }

  const results: SubscriptionSummary[] = []
  for (const list of groups.values()) {
    const sorted = [...list].sort((a, b) => (a.expense_date < b.expense_date ? 1 : -1))
    results.push({
      description: sorted[0].description ?? 'Subscription',
      monthlyAmount: sorted[0].amount,
      lastChargedDate: sorted[0].expense_date,
      occurrences: sorted.length,
    })
  }

  return results.sort((a, b) => b.monthlyAmount - a.monthlyAmount)
}

export interface PossibleDuplicate {
  description: string
  amount: number
  dates: string[]
}

const DUPLICATE_WINDOW_DAYS = 3

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Flags same-amount, same-description charges within a few days of each
 * other — a common sign of an accidental double charge or duplicate import.
 */
export function findPossibleDuplicates(expenses: Expense[]): PossibleDuplicate[] {
  const groups = new Map<string, Expense[]>()
  for (const e of expenses) {
    const key = `${e.amount}|${(e.description ?? '').trim().toLowerCase()}`
    const list = groups.get(key) ?? []
    list.push(e)
    groups.set(key, list)
  }

  const duplicates: PossibleDuplicate[] = []
  for (const list of groups.values()) {
    if (list.length < 2) continue
    const sorted = [...list].sort((a, b) => (a.expense_date < b.expense_date ? -1 : 1))
    for (let i = 1; i < sorted.length; i++) {
      if (daysBetween(sorted[i - 1].expense_date, sorted[i].expense_date) <= DUPLICATE_WINDOW_DAYS) {
        duplicates.push({
          description: sorted[i].description ?? '(no description)',
          amount: sorted[i].amount,
          dates: [sorted[i - 1].expense_date, sorted[i].expense_date],
        })
      }
    }
  }

  return duplicates
}
