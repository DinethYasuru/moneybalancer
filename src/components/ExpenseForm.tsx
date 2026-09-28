import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Category } from '../lib/types'
import { FileDropzone } from './FileDropzone'
import './ExpenseForm.css'

interface ExpenseFormProps {
  categories: Category[]
  onSaved: () => void
}

export function ExpenseForm({ categories, onSaved }: ExpenseFormProps) {
  const { user } = useAuth()
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [isRecurring, setIsRecurring] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setError(null)
    setSubmitting(true)

    const { data: expense, error: insertError } = await supabase
      .from('expenses')
      .insert({
        user_id: user.id,
        category_id: categoryId || null,
        amount: Number(amount),
        description: description || null,
        expense_date: expenseDate,
        is_recurring: isRecurring,
      })
      .select()
      .single()

    if (insertError || !expense) {
      setError(insertError?.message ?? 'Failed to save expense')
      setSubmitting(false)
      return
    }

    for (const file of files) {
      const path = `${user.id}/${expense.id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('attachments').upload(path, file)
      if (uploadError) {
        setError(`Expense saved, but attachment "${file.name}" failed to upload: ${uploadError.message}`)
        continue
      }
      await supabase.from('attachments').insert({
        user_id: user.id,
        expense_id: expense.id,
        storage_path: path,
        original_filename: file.name,
        file_type: file.type,
        file_size_bytes: file.size,
      })
    }

    setSubmitting(false)
    setAmount('')
    setDescription('')
    setFiles([])
    onSaved()
  }

  return (
    <form className="expense-form card" onSubmit={handleSubmit}>
      <h2>Add expense</h2>

      <div className="expense-form-row">
        <label>
          Amount
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </label>

        <label>
          Category
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="expense-form-row">
        <label>
          Date
          <input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} required />
        </label>

        <label className="expense-form-checkbox">
          <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
          Recurring monthly
        </label>
      </div>

      <label>
        Description
        <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. September electricity bill" />
      </label>

      <label className="expense-form-label-only">Slip / receipt (optional)</label>
      <FileDropzone files={files} onFilesChange={setFiles} />

      {error && <p className="expense-form-error">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save expense'}
      </button>
    </form>
  )
}
