import type { Category, Expense } from './types'

export interface CategoryBreakdown {
  categoryId: string | null
  categoryName: string
  currentTotal: number
  previousTotal: number
  changeAmount: number
  changePct: number | null // null when previous was 0 (can't compute a meaningful %)
}

export interface MonthlyAnalysis {
  currentMonthLabel: string
  previousMonthLabel: string
  currentTotal: number
  previousTotal: number
  totalChangePct: number | null
  breakdown: CategoryBreakdown[]
  suggestions: string[]
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

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized'

  const allCategoryIds = new Set([...currentByCategory.keys(), ...previousByCategory.keys()])
  const breakdown: CategoryBreakdown[] = Array.from(allCategoryIds).map((id) => {
    const current = currentByCategory.get(id) ?? 0
    const previous = previousByCategory.get(id) ?? 0
    const changeAmount = current - previous
    const changePct = previous > 0 ? changeAmount / previous : null
    return {
      categoryId: id === 'uncategorized' ? null : id,
      categoryName: id === 'uncategorized' ? 'Uncategorized' : categoryName(id),
      currentTotal: current,
      previousTotal: previous,
      changeAmount,
      changePct,
    }
  })

  breakdown.sort((a, b) => b.currentTotal - a.currentTotal)

  const suggestions: string[] = []
  for (const b of breakdown) {
    if (b.currentTotal < MIN_AMOUNT_FOR_FLAG) continue
    if (b.changePct !== null && b.changePct >= GROWTH_FLAG_THRESHOLD) {
      suggestions.push(
        `${b.categoryName} is up ${(b.changePct * 100).toFixed(0)}% vs last month (${b.previousTotal.toFixed(2)} → ${b.currentTotal.toFixed(2)}). Worth checking what changed.`,
      )
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
  }
}
