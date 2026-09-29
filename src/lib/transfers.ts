import type { ParsedTransaction } from './statementParser'

/**
 * Money moved between the user's own accounts (main -> secondary ->
 * even a third party they're just relaying funds through) isn't real
 * income or an expense — it needs to be recognized and excluded from
 * expense/income totals, not double-counted. Nothing here ever touches
 * account numbers or other bank identifiers; detection works purely off
 * description text, amount, and date, same fields already stored.
 */

const TRANSFER_KEYWORDS = /\b(own account|between accounts|self transfer|fund transfer|funds transfer|internal transfer|a\/c to a\/c)\b/i

export function isLikelyTransferDescription(description: string): boolean {
  return TRANSFER_KEYWORDS.test(description)
}

export interface TransferCandidateRow {
  index: number
  date: string
  description: string
  amount: number
  direction: 'debit' | 'credit'
}

const MATCH_WINDOW_DAYS = 2

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Finds debit/credit pairs across the rows of a batch (e.g. importing a
 * "main" and "secondary" account statement together) with a matching
 * amount within a couple of days of each other — the signature of the
 * same transfer showing up as an outflow on one side and an inflow on
 * the other. Returns the row indexes that should be treated as internal
 * transfers rather than real income/expense.
 */
export function findTransferPairs(rows: TransferCandidateRow[]): Set<number> {
  const transferIndexes = new Set<number>()
  const debits = rows.filter((r) => r.direction === 'debit' && !transferIndexes.has(r.index))
  const credits = rows.filter((r) => r.direction === 'credit')

  for (const debit of debits) {
    const match = credits.find(
      (credit) => !transferIndexes.has(credit.index) && Math.abs(credit.amount - debit.amount) < 0.01 && daysBetween(debit.date, credit.date) <= MATCH_WINDOW_DAYS,
    )
    if (match) {
      transferIndexes.add(debit.index)
      transferIndexes.add(match.index)
    }
  }

  // Keyword-based hints catch the single-sided case (only one account's
  // statement was imported, so there's no matching row to pair against).
  for (const row of rows) {
    if (!transferIndexes.has(row.index) && isLikelyTransferDescription(row.description)) {
      transferIndexes.add(row.index)
    }
  }

  return transferIndexes
}

export function toTransferCandidates(parsed: ParsedTransaction[], startIndex: number): TransferCandidateRow[] {
  return parsed.map((p, i) => ({ index: startIndex + i, date: p.date, description: p.description, amount: p.amount, direction: p.direction }))
}
