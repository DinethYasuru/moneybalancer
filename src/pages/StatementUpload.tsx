import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { parseStatementPdf, parseStatementCsv, parseStatementText, type ParsedTransaction } from '../lib/statementParser'
import { guessCategoryName } from '../lib/categorize'
import type { Category } from '../lib/types'
import { useCategories } from '../hooks/useCategories'
import './StatementUpload.css'

interface ReviewRow extends ParsedTransaction {
  categoryId: string
  include: boolean
}

export function StatementUpload() {
  const { user } = useAuth()
  const { categories } = useCategories()
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [pasteText, setPasteText] = useState('')

  function guessCategoryId(description: string): string {
    const guessedName = guessCategoryName(description)
    const match = guessedName ? categories.find((c) => c.name.toLowerCase() === guessedName.toLowerCase()) : null
    return match?.id ?? categories.find((c) => c.name === 'Other')?.id ?? categories[0]?.id ?? ''
  }

  function applyParsed(parsed: ParsedTransaction[], emptyMessage: string) {
    setRows(
      parsed.map((p) => ({
        ...p,
        categoryId: p.direction === 'debit' ? guessCategoryId(p.description) : '',
        include: true,
      })),
    )
    if (parsed.length === 0) setError(emptyMessage)
  }

  async function handleFileSelect(f: File) {
    setFile(f)
    setError(null)
    setSavedCount(null)
    setParsing(true)
    try {
      const isCsv = f.type === 'text/csv' || f.name.toLowerCase().endsWith('.csv')
      const parsed = isCsv ? await parseStatementCsv(f) : await parseStatementPdf(f)
      applyParsed(
        parsed,
        isCsv
          ? 'No transactions could be detected in this CSV. Make sure it has a header row with Date/Description/Amount (or Debit/Credit) columns.'
          : 'No transactions could be automatically detected. This statement layout may not be supported — try a different export, or check back once parsing improves.',
      )
    } catch {
      setError('Could not read this file. Make sure it is a text-based PDF statement or a CSV export, not a scanned image.')
    } finally {
      setParsing(false)
    }
  }

  function handlePasteParse() {
    setError(null)
    setSavedCount(null)
    if (!pasteText.trim()) {
      setError('Paste some statement text first.')
      return
    }
    const parsed = parseStatementText(pasteText)
    applyParsed(
      parsed,
      'No transactions could be detected in the pasted text. Make sure the first line is a header row (Date, Description, Amount or Debit/Credit) and columns are separated by commas or tabs.',
    )
    // Treat the pasted text as a "file" so it uploads to storage the same way as a real CSV.
    setFile(new File([pasteText], `pasted-statement-${Date.now()}.csv`, { type: 'text/csv' }))
  }

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function handleConfirm() {
    if (!user || !file) return
    const included = rows.filter((r) => r.include)
    if (included.length === 0) {
      setError('Select at least one transaction to save.')
      return
    }

    setSaving(true)
    setError(null)

    const storagePath = `${user.id}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage.from('bank-statements').upload(storagePath, file)
    if (uploadError) {
      setError(`Failed to upload statement: ${uploadError.message}`)
      setSaving(false)
      return
    }

    const { data: statement, error: statementError } = await supabase
      .from('bank_statements')
      .insert({
        user_id: user.id,
        storage_path: storagePath,
        original_filename: file.name,
        status: 'reviewed',
      })
      .select()
      .single()

    if (statementError || !statement) {
      setError(statementError?.message ?? 'Failed to save statement record')
      setSaving(false)
      return
    }

    let savedExpenses = 0
    for (const row of included) {
      let expenseId: string | null = null

      if (row.direction === 'debit') {
        const { data: expense } = await supabase
          .from('expenses')
          .insert({
            user_id: user.id,
            category_id: row.categoryId || null,
            amount: row.amount,
            description: row.description,
            expense_date: row.date,
          })
          .select()
          .single()
        expenseId = expense?.id ?? null
        if (expenseId) savedExpenses++
      }

      await supabase.from('statement_transactions').insert({
        user_id: user.id,
        statement_id: statement.id,
        txn_date: row.date,
        description: row.description,
        amount: row.amount,
        direction: row.direction,
        category_id: row.direction === 'debit' ? row.categoryId || null : null,
        confirmed: true,
        expense_id: expenseId,
      })
    }

    setSaving(false)
    setSavedCount(savedExpenses)
    setFile(null)
    setRows([])
    setPasteText('')
  }

  return (
    <div className="statement-upload">
      <h2>Upload bank statement</h2>
      <p className="statement-upload-hint">
        Upload a PDF or CSV bank statement, or paste statement text copied from your bank's website. We'll try to
        detect transactions automatically — review and fix anything before it's saved as real expenses.
      </p>

      <div className="statement-mode-toggle">
        <button type="button" className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>
          Upload file
        </button>
        <button type="button" className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}>
          Paste text
        </button>
      </div>

      {mode === 'file' ? (
        <label className="statement-upload-picker">
          Choose PDF or CSV
          <input
            type="file"
            accept="application/pdf,text/csv,.csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFileSelect(f)
            }}
          />
        </label>
      ) : (
        <div className="statement-paste">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={'Paste statement rows here, first line as header, e.g.\nDate, Description, Debit, Credit\n01/09/2026, Salary Deposit, , 150000.00\n03/09/2026, Rent Payment, 45000.00, '}
            rows={6}
          />
          <button type="button" onClick={handlePasteParse}>
            Parse pasted text
          </button>
        </div>
      )}

      {parsing && <p>Reading file…</p>}
      {error && <p className="statement-upload-error">{error}</p>}
      {savedCount !== null && (
        <p className="statement-upload-success">Saved {savedCount} expense{savedCount === 1 ? '' : 's'} from this statement.</p>
      )}

      {rows.length > 0 && (
        <>
          <div className="statement-table-wrapper">
            <table className="statement-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className={row.include ? '' : 'statement-row-excluded'}>
                    <td>
                      <input type="checkbox" checked={row.include} onChange={(e) => updateRow(i, { include: e.target.checked })} />
                    </td>
                    <td>
                      <input type="date" value={row.date} onChange={(e) => updateRow(i, { date: e.target.value })} />
                    </td>
                    <td>
                      <input type="text" value={row.description} onChange={(e) => updateRow(i, { description: e.target.value })} />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(e) => updateRow(i, { amount: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        value={row.direction}
                        onChange={(e) => {
                          const direction = e.target.value as 'debit' | 'credit'
                          updateRow(i, {
                            direction,
                            categoryId: direction === 'debit' && !row.categoryId ? guessCategoryId(row.description) : row.categoryId,
                          })
                        }}
                      >
                        <option value="debit">Expense (debit)</option>
                        <option value="credit">Income (credit)</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.categoryId}
                        onChange={(e) => updateRow(i, { categoryId: e.target.value })}
                        disabled={row.direction === 'credit'}
                      >
                        {categories.map((c: Category) => (
                          <option key={c.id} value={c.id}>
                            {c.icon} {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={handleConfirm} disabled={saving}>
            {saving ? 'Saving…' : `Confirm & save ${rows.filter((r) => r.include).length} transactions`}
          </button>
        </>
      )}
    </div>
  )
}
