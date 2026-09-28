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

/**
 * Some banks' PDF exports truncate the date column's year to 3 digits
 * (e.g. "25/08/202" instead of "25/08/2026") — a column-width artifact,
 * not a real 3-digit year. When that happens, borrow the missing digit
 * from a reference year found elsewhere in the document (e.g. the
 * statement's own "Period" or "Date & Time" line, which isn't
 * truncated).
 */
function findReferenceYear(fullText: string): string | null {
  const matches = fullText.match(/\b20\d{2}\b/g)
  if (!matches || matches.length === 0) return null
  const counts = new Map<string, number>()
  for (const y of matches) counts.set(y, (counts.get(y) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

function normalizeDate(token: string, referenceYear?: string | null): string | null {
  for (const [pattern, toIso] of DATE_PATTERNS) {
    const m = token.match(pattern)
    if (!m) continue
    const iso = toIso(m)
    if (!iso) continue
    const year = iso.slice(0, iso.indexOf('-'))
    if (year.length === 3) {
      if (referenceYear && referenceYear.startsWith(year)) return referenceYear + iso.slice(3)
      continue // unresolvable truncated year — treat as no match
    }
    if (year.length !== 4) continue
    return iso
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

const NUMERIC_TOKEN = /^-?[\d,]+\.\d{2}$/

/**
 * Heuristic line parser: DATE  DESCRIPTION...  [DEBIT]  [CREDIT]  [BALANCE]
 * or DATE DESCRIPTION... AMOUNT [DR|CR]. Bank statement layouts vary a
 * lot, so this is a best-effort first pass — the caller always shows
 * results in an editable review table.
 *
 * When a line ends in two numbers (amount + running balance, common in
 * "Debits | Credits | Balance" layouts), the second-to-last is the
 * amount and the last is the balance — and since blank Debit/Credit
 * cells produce no text at all, there's no positional way to tell which
 * column a lone number came from. The running balance solves that: if
 * it's known from the previous row, whether the balance went up or down
 * tells us debit vs credit directly, which is more reliable than
 * guessing from keywords.
 */
function parseLine(line: string, referenceYear: string | null, previousBalance: number | null): { transaction: ParsedTransaction; balance: number | null } | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const tokens = trimmed.split(/\s+/)
  if (tokens.length < 3) return null

  const isoDate = normalizeDate(tokens[0], referenceYear)
  if (!isoDate) return null

  let explicitDirection: 'debit' | 'credit' | null = null
  let scanEnd = tokens.length

  if (/^(DR|CR)$/i.test(tokens[scanEnd - 1])) {
    explicitDirection = tokens[scanEnd - 1].toUpperCase() === 'DR' ? 'debit' : 'credit'
    scanEnd--
  }

  const numericValues: number[] = []
  let idx = scanEnd - 1
  while (idx > 0 && NUMERIC_TOKEN.test(tokens[idx])) {
    numericValues.unshift(Number(tokens[idx].replace(/,/g, '')))
    idx--
  }
  if (numericValues.length === 0) return null

  const descEnd = idx + 1
  const description = tokens.slice(1, descEnd).join(' ').replace(/\bNA\b$/i, '').trim()
  if (!description) return null

  let amount: number
  let balance: number | null = null

  if (numericValues.length >= 2) {
    // Trailing pair: [amount, balance]. Extra leading numbers (rare) are ignored.
    amount = Math.abs(numericValues[numericValues.length - 2])
    balance = numericValues[numericValues.length - 1]
  } else {
    amount = Math.abs(numericValues[0])
  }
  if (amount <= 0) return null

  let direction: 'debit' | 'credit'
  if (explicitDirection) {
    direction = explicitDirection
  } else if (balance !== null && previousBalance !== null) {
    direction = balance >= previousBalance ? 'credit' : 'debit'
  } else {
    direction = /\b(credit|deposit|received|refund)\b/i.test(description) ? 'credit' : 'debit'
  }

  return { transaction: { date: isoDate, description, amount, direction }, balance }
}

const HEADER_ALIASES: Record<string, string[]> = {
  date: ['date', 'txn date', 'transaction date', 'value date', 'posting date'],
  description: ['description', 'narrative', 'particulars', 'details', 'remarks', 'transaction details'],
  debit: ['debit', 'debits', 'withdrawal', 'withdrawals', 'debit amount', 'dr'],
  credit: ['credit', 'credits', 'deposit', 'deposits', 'credit amount', 'cr'],
  amount: ['amount', 'transaction amount', 'value'],
  type: ['type', 'dr/cr', 'transaction type', 'cr/dr'],
}

function findColumn(headers: string[], key: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[key]
  return headers.findIndex((h) => aliases.includes(h.trim().toLowerCase().replace(/\.$/, '')))
}

/**
 * Minimal delimited-line splitter that respects double-quoted fields
 * containing the delimiter. Used for both comma-separated CSV files and
 * tab-separated text pasted from a spreadsheet or bank web portal.
 */
function splitDelimitedLine(line: string, delimiter: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === delimiter) {
      fields.push(current)
      current = ''
    } else {
      current += char
    }
  }
  fields.push(current)
  return fields.map((f) => f.trim())
}

function detectDelimiter(headerLine: string): string {
  if (headerLine.includes('\t')) return '\t'
  if (headerLine.includes(',')) return ','
  if (headerLine.includes(';')) return ';'
  return ','
}

export function parseStatementText(text: string): ParsedTransaction[] {
  const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const delimiter = detectDelimiter(lines[0])
  const splitCsvLine = (line: string) => splitDelimitedLine(line, delimiter)
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase())
  const dateCol = findColumn(headers, 'date')
  const descCol = findColumn(headers, 'description')
  const debitCol = findColumn(headers, 'debit')
  const creditCol = findColumn(headers, 'credit')
  const amountCol = findColumn(headers, 'amount')
  const typeCol = findColumn(headers, 'type')

  if (dateCol === -1) return []

  const transactions: ParsedTransaction[] = []

  for (const line of lines.slice(1)) {
    const fields = splitCsvLine(line)
    const isoDate = normalizeDate(fields[dateCol]?.trim())
    if (!isoDate) continue

    const description = descCol !== -1 ? fields[descCol] ?? '' : ''

    let amount: number | null = null
    let direction: 'debit' | 'credit' | null = null

    if (debitCol !== -1 || creditCol !== -1) {
      const debitAmount = debitCol !== -1 ? parseAmount(fields[debitCol] ?? '') : null
      const creditAmount = creditCol !== -1 ? parseAmount(fields[creditCol] ?? '') : null
      if (debitAmount && debitAmount > 0) {
        amount = debitAmount
        direction = 'debit'
      } else if (creditAmount && creditAmount > 0) {
        amount = creditAmount
        direction = 'credit'
      }
    } else if (amountCol !== -1) {
      const raw = fields[amountCol] ?? ''
      const parsed = parseAmount(raw.replace(/[()]/g, ''))
      if (parsed !== null) {
        amount = Math.abs(parsed)
        if (typeCol !== -1) {
          direction = /^cr/i.test(fields[typeCol] ?? '') ? 'credit' : 'debit'
        } else {
          direction = raw.trim().startsWith('-') || raw.trim().startsWith('(') ? 'debit' : 'credit'
        }
      }
    }

    if (amount === null || amount <= 0 || !direction) continue

    transactions.push({ date: isoDate, description: description.trim() || '(no description)', amount, direction })
  }

  return transactions
}

export async function parseStatementCsv(file: File): Promise<ParsedTransaction[]> {
  const text = await file.text()
  return parseStatementText(text)
}

const ROW_Y_TOLERANCE = 2.5

export async function parseStatementPdf(file: File): Promise<ParsedTransaction[]> {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const lines: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()

    const items = content.items
      .filter((it) => 'str' in it && it.str.trim().length > 0)
      .map((it) => {
        const textItem = it as { str: string; transform: number[] }
        return { str: textItem.str, x: textItem.transform[4], y: textItem.transform[5] }
      })
      .sort((a, b) => b.y - a.y || a.x - b.x)

    // Cluster into rows by y-proximity rather than exact match — table
    // cells can land on slightly different baselines (font metrics, cell
    // padding), which would otherwise split one visual row into several
    // fragments too short to parse.
    const rowBuckets: { y: number; items: typeof items }[] = []
    for (const item of items) {
      const bucket = rowBuckets.find((b) => Math.abs(b.y - item.y) <= ROW_Y_TOLERANCE)
      if (bucket) bucket.items.push(item)
      else rowBuckets.push({ y: item.y, items: [item] })
    }

    for (const bucket of rowBuckets) {
      lines.push(
        bucket.items
          .sort((a, b) => a.x - b.x)
          .map((it) => it.str)
          .join(' '),
      )
    }
  }

  const referenceYear = findReferenceYear(lines.join('\n'))

  const transactions: ParsedTransaction[] = []
  let previousBalance: number | null = null
  for (const line of lines) {
    const parsed = parseLine(line, referenceYear, previousBalance)
    if (parsed) {
      transactions.push(parsed.transaction)
      if (parsed.balance !== null) previousBalance = parsed.balance
    }
  }
  return transactions
}
