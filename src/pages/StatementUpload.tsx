import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { parseStatementPdf, type ParsedTransaction } from '../lib/statementParser'
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

  async function handleFileSelect(f: File) {
    setFile(f)
    setError(null)
    setSavedCount(null)
    setParsing(true)
    try {
      const parsed = await parseStatementPdf(f)
      const defaultCategoryId = categories[0]?.id ?? ''
      setRows(parsed.map((p) => ({ ...p, categoryId: defaultCategoryId, include: true })))
      if (parsed.length === 0) {
        setError('No transactions could be automatically detected. This statement layout may not be supported — try a different export, or check back once parsing improves.')
      }
    } catch {
      setError('Could not read this PDF. Make sure it is a text-based statement, not a scanned image.')
    } finally {
      setParsing(false)
    }
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
  }

  return (
    <div className="statement-upload">
      <h2>Upload bank statement</h2>
      <p className="statement-upload-hint">
        Upload a PDF bank statement. We'll try to detect transactions automatically — review and fix anything
        before it's saved as real expenses.
      </p>

      <label className="statement-upload-picker">
        Choose PDF
        <input
          type="file"
          accept="application/pdf"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleFileSelect(f)
          }}
        />
      </label>

      {parsing && <p>Reading PDF…</p>}
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
                      <select value={row.direction} onChange={(e) => updateRow(i, { direction: e.target.value as 'debit' | 'credit' })}>
                        <option value="debit">Debit</option>
                        <option value="credit">Credit</option>
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
                            {c.name}
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
