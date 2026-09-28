import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { parseStatementPdf, parseStatementCsv, parseStatementText, type ParsedTransaction } from '../lib/statementParser'
import type { Category } from '../lib/types'
import { useCategories } from '../hooks/useCategories'
import { useMerchantMemory } from '../hooks/useMerchantMemory'
import { FileDropzone } from '../components/FileDropzone'
import './StatementUpload.css'

interface ReviewRow extends ParsedTransaction {
  categoryId: string
  include: boolean
  sourceIndex: number
}

export function StatementUpload() {
  const { user } = useAuth()
  const { categories } = useCategories()
  const { guessCategoryId, learn } = useMerchantMemory()
  const [files, setFiles] = useState<File[]>([])
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedCount, setSavedCount] = useState<number | null>(null)
  const [mode, setMode] = useState<'file' | 'paste'>('file')
  const [pasteText, setPasteText] = useState('')

  function categorize(parsed: ParsedTransaction[], sourceIndex: number): ReviewRow[] {
    return parsed.map((p) => ({
      ...p,
      categoryId: p.direction === 'debit' ? guessCategoryId(p.description, categories) : '',
      include: true,
      sourceIndex,
    }))
  }

  async function handleParseFiles() {
    if (files.length === 0) return
    setError(null)
    setSavedCount(null)
    setParsing(true)

    const allRows: ReviewRow[] = []
    const failures: string[] = []

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const isCsv = f.type === 'text/csv' || f.name.toLowerCase().endsWith('.csv')
      try {
        const parsed = isCsv ? await parseStatementCsv(f) : await parseStatementPdf(f)
        if (parsed.length === 0) failures.push(`${f.name}: no transactions detected`)
        allRows.push(...categorize(parsed, i))
      } catch {
        failures.push(`${f.name}: could not read this file`)
      }
    }

    setRows(allRows)
    if (failures.length > 0) {
      setError(`Some files had issues — you can still review/save what parsed:\n${failures.join('\n')}`)
    }
    setParsing(false)
  }

  function handlePasteParse() {
    setError(null)
    setSavedCount(null)
    if (!pasteText.trim()) {
      setError('Paste some statement text first.')
      return
    }
    const parsed = parseStatementText(pasteText)
    if (parsed.length === 0) {
      setError(
        'No transactions could be detected in the pasted text. Make sure the first line is a header row (Date, Description, Amount or Debit/Credit) and columns are separated by commas or tabs.',
      )
      return
    }
    const pastedFile = new File([pasteText], `pasted-statement-${Date.now()}.csv`, { type: 'text/csv' })
    setFiles([pastedFile])
    setRows(categorize(parsed, 0))
  }

  function updateRow(index: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  async function handleConfirm() {
    if (!user || files.length === 0) return
    const included = rows.filter((r) => r.include)
    if (included.length === 0) {
      setError('Select at least one transaction to save.')
      return
    }

    setSaving(true)
    setError(null)

    // Upload every source file and create one bank_statements row per file,
    // so multiple passbooks/statements can be imported in a single go.
    const usedSourceIndexes = [...new Set(included.map((r) => r.sourceIndex))]
    const statementIdByFileIndex = new Map<number, string>()

    for (const idx of usedSourceIndexes) {
      const f = files[idx]
      const storagePath = `${user.id}/${Date.now()}-${idx}-${f.name}`
      const { error: uploadError } = await supabase.storage.from('bank-statements').upload(storagePath, f)
      if (uploadError) {
        setError(`Failed to upload ${f.name}: ${uploadError.message}`)
        setSaving(false)
        return
      }

      const { data: statement, error: statementError } = await supabase
        .from('bank_statements')
        .insert({ user_id: user.id, storage_path: storagePath, original_filename: f.name, status: 'reviewed' })
        .select()
        .single()

      if (statementError || !statement) {
        setError(statementError?.message ?? `Failed to save statement record for ${f.name}`)
        setSaving(false)
        return
      }
      statementIdByFileIndex.set(idx, statement.id)
    }

    // Pre-generate ids client-side so both tables can be inserted in a single
    // batched call each, instead of one round trip per row.
    const rowsWithIds = included.map((row) => ({
      row,
      expenseId: row.direction === 'debit' ? crypto.randomUUID() : null,
    }))

    const debitRows = rowsWithIds.filter((r) => r.expenseId)
    if (debitRows.length > 0) {
      const { error: expensesError } = await supabase.from('expenses').insert(
        debitRows.map(({ row, expenseId }) => ({
          id: expenseId,
          user_id: user.id,
          category_id: row.categoryId || null,
          amount: row.amount,
          description: row.description,
          expense_date: row.date,
        })),
      )
      if (expensesError) {
        setError(`Failed to save expenses: ${expensesError.message}`)
        setSaving(false)
        return
      }
    }

    const { error: transactionsError } = await supabase.from('statement_transactions').insert(
      rowsWithIds.map(({ row, expenseId }) => ({
        user_id: user.id,
        statement_id: statementIdByFileIndex.get(row.sourceIndex),
        txn_date: row.date,
        description: row.description,
        amount: row.amount,
        direction: row.direction,
        category_id: row.direction === 'debit' ? row.categoryId || null : null,
        confirmed: true,
        expense_id: expenseId,
      })),
    )
    if (transactionsError) {
      setError(`Expenses saved, but recording statement transactions failed: ${transactionsError.message}`)
      setSaving(false)
      return
    }

    const savedExpenses = debitRows.length

    for (const { row } of debitRows) {
      if (row.categoryId) learn(row.description, row.categoryId)
    }

    setSaving(false)
    setSavedCount(savedExpenses)
    setFiles([])
    setRows([])
    setPasteText('')
  }

  return (
    <div className="statement-upload page-enter">
      <h2>Upload bank statements</h2>
      <p className="statement-upload-hint">
        Upload one or more PDF/CSV bank statements — handy if you're importing multiple passbooks at once — or paste
        statement text copied from your bank's website. We'll try to detect transactions automatically; review and
        fix anything before it's saved as real expenses.
      </p>

      <div className="statement-mode-toggle">
        <button type="button" className={mode === 'file' ? 'active' : ''} onClick={() => setMode('file')}>
          Upload files
        </button>
        <button type="button" className={mode === 'paste' ? 'active' : ''} onClick={() => setMode('paste')}>
          Paste text
        </button>
      </div>

      {mode === 'file' ? (
        <div className="statement-file-mode">
          <FileDropzone
            files={files}
            onFilesChange={setFiles}
            acceptedTypes={['application/pdf', 'text/csv']}
            acceptedExtensions={['.csv']}
            hint="Drag & drop PDF or CSV statements (multiple at once), paste from clipboard, or click to browse"
          />
          {files.length > 0 && (
            <button type="button" onClick={handleParseFiles} disabled={parsing} className="statement-parse-btn">
              {parsing ? 'Reading…' : `Parse ${files.length} statement${files.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
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

      {error && <p className="statement-upload-error">{error}</p>}
      {savedCount !== null && (
        <p className="statement-upload-success">Saved {savedCount} expense{savedCount === 1 ? '' : 's'} from this import.</p>
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
                  {files.length > 1 && <th>Source</th>}
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
                            categoryId: direction === 'debit' && !row.categoryId ? guessCategoryId(row.description, categories) : row.categoryId,
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
                    {files.length > 1 && <td className="statement-source-cell">{files[row.sourceIndex]?.name}</td>}
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
