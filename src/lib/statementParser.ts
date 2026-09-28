import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export interface ParsedTransaction {
  date: string // ISO yyyy-mm-dd
  description: string
  amount: number
  direction: 'debit' | 'credit'
}

const DATE_PATTERNS: [RegExp, (m: RegExpMatchArray) => string | null][] = [
  // dd/mm/yyyy or dd-mm-yyyy or dd.mm.yyyy
  [
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/,
    (m) => {
      const [, d, mo, y] = m
      const year = y.length === 2 ? `20${y}` : y
      return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    },
  ],
  // yyyy-mm-dd
  [/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (m) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`],
]

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

function normalizeDate(token: string): string | null {
  for (const [pattern, toIso] of DATE_PATTERNS) {
    const m = token.match(pattern)
    if (m) return toIso(m)
  }
  // dd MMM yyyy, e.g. 05 Sep 2026
  const m = token.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[\s-](\d{4})$/)
  if (m) {
    const month = MONTHS[m[2].toLowerCase()]
    if (month) return `${m[3]}-${month}-${m[1].padStart(2, '0')}`
  }
  return null
}

function parseAmount(token: string): number | null {
  const cleaned = token.replace(/,/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Heuristic line parser: DATE  DESCRIPTION...  AMOUNT  [DR|CR]
 * Bank statement layouts vary a lot, so this is a best-effort first pass —
 * the caller always shows results in an editable review table.
 */
function parseLine(line: string): ParsedTransaction | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const tokens = trimmed.split(/\s+/)
  if (tokens.length < 3) return null

  const isoDate = normalizeDate(tokens[0])
  if (!isoDate) return null

  let direction: 'debit' | 'credit' | null = null
  let amountToken = tokens[tokens.length - 1]

  if (/^(DR|CR)$/i.test(amountToken)) {
    direction = amountToken.toUpperCase() === 'DR' ? 'debit' : 'credit'
    amountToken = tokens[tokens.length - 2]
  }

  const amount = parseAmount(amountToken)
  if (amount === null || amount <= 0) return null

  const descEnd = direction ? tokens.length - 2 : tokens.length - 1
  const description = tokens.slice(1, descEnd).join(' ').trim()
  if (!description) return null

  if (!direction) {
    const lower = trimmed.toLowerCase()
    direction = /\b(credit|deposit|received|refund)\b/.test(lower) ? 'credit' : 'debit'
  }

  return { date: isoDate, description, amount, direction }
}

export async function parseStatementPdf(file: File): Promise<ParsedTransaction[]> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const lines: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    const rows = new Map<number, string[]>()
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue
      const y = Math.round(item.transform[5])
      const bucket = rows.get(y) ?? []
      bucket.push(item.str)
      rows.set(y, bucket)
    }

    const sortedYs = Array.from(rows.keys()).sort((a, b) => b - a)
    for (const y of sortedYs) {
      lines.push(rows.get(y)!.join(' '))
    }
  }

  const transactions: ParsedTransaction[] = []
  for (const line of lines) {
    const parsed = parseLine(line)
    if (parsed) transactions.push(parsed)
  }
  return transactions
}
