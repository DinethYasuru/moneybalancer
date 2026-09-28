import { useState, type FormEvent } from 'react'
import { useCategories } from '../hooks/useCategories'
import type { Category } from '../lib/types'
import './Categories.css'

const SWATCHES = ['#5b4fe8', '#14b8a6', '#f0a93a', '#e0435c', '#17a673', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#6b7280']

export function Categories() {
  const { categories, addCategory, updateCategory, deleteCategory } = useCategories()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('🏷️')
  const [color, setColor] = useState(SWATCHES[0])
  const [budget, setBudget] = useState('')
  const [essential, setEssential] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function handleAdd(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await addCategory({
      name: name.trim(),
      icon,
      color,
      monthly_budget: budget ? Number(budget) : null,
      is_essential: essential,
    })
    setSubmitting(false)
    if (error) {
      setError(error)
      return
    }
    setName('')
    setIcon('🏷️')
    setColor(SWATCHES[0])
    setBudget('')
    setEssential(true)
  }

  async function handleDelete(cat: Category) {
    if (!confirm(`Delete "${cat.name}"? Expenses in this category will become uncategorized.`)) return
    await deleteCategory(cat.id)
  }

  return (
    <div className="categories-page">
      <h2>Categories</h2>
      <p className="categories-hint">
        Add your own categories, set a monthly budget to track against, and mark whether it's essential (bills,
        groceries) or discretionary (dining out, subscriptions) — this feeds the waste-detection on the Analysis page.
      </p>

      <form className="category-form card" onSubmit={handleAdd}>
        <div className="category-form-row">
          <label>
            Icon
            <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="category-icon-input" />
          </label>
          <label className="category-form-name">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Pet Care" />
          </label>
        </div>

        <div className="category-form-row">
          <label className="category-form-name">
            Monthly budget (optional)
            <input type="number" step="0.01" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 10000" />
          </label>
          <label className="category-essential-toggle">
            <input type="checkbox" checked={essential} onChange={(e) => setEssential(e.target.checked)} />
            Essential
          </label>
        </div>

        <div className="category-swatches">
          {SWATCHES.map((s) => (
            <button
              key={s}
              type="button"
              className={`category-swatch${color === s ? ' category-swatch-active' : ''}`}
              style={{ background: s }}
              onClick={() => setColor(s)}
              aria-label={`Choose color ${s}`}
            />
          ))}
        </div>

        {error && <p className="categories-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add category'}
        </button>
      </form>

      <ul className="category-list">
        {categories.map((cat) => (
          <li key={cat.id} className="card">
            {editingId === cat.id ? (
              <EditRow
                category={cat}
                onCancel={() => setEditingId(null)}
                onSave={async (patch) => {
                  await updateCategory(cat.id, patch)
                  setEditingId(null)
                }}
              />
            ) : (
              <div className="category-row">
                <span className="category-chip" style={{ background: `${cat.color}22`, color: cat.color ?? undefined }}>
                  <span>{cat.icon}</span> {cat.name}
                </span>
                <span className={`category-essential-badge ${cat.is_essential ? 'is-essential' : 'is-discretionary'}`}>
                  {cat.is_essential ? 'Essential' : 'Discretionary'}
                </span>
                {cat.monthly_budget != null && <span className="category-budget-label">Budget: {cat.monthly_budget.toFixed(2)}</span>}
                <div className="category-row-actions">
                  <button type="button" onClick={() => setEditingId(cat.id)}>
                    Edit
                  </button>
                  <button type="button" className="category-delete" onClick={() => handleDelete(cat)}>
                    Delete
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EditRow({
  category,
  onSave,
  onCancel,
}: {
  category: Category
  onSave: (patch: { name: string; icon: string; color: string; monthly_budget: number | null; is_essential: boolean }) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(category.name)
  const [icon, setIcon] = useState(category.icon ?? '')
  const [color, setColor] = useState(category.color ?? SWATCHES[0])
  const [budget, setBudget] = useState(category.monthly_budget?.toString() ?? '')
  const [essential, setEssential] = useState(category.is_essential)

  return (
    <div className="category-edit-row">
      <input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="category-icon-input" />
      <input value={name} onChange={(e) => setName(e.target.value)} className="category-edit-name" />
      <input
        type="number"
        step="0.01"
        min="0"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        placeholder="Budget"
        className="category-edit-budget"
      />
      <label className="category-essential-toggle">
        <input type="checkbox" checked={essential} onChange={(e) => setEssential(e.target.checked)} />
        Essential
      </label>
      <div className="category-swatches">
        {SWATCHES.map((s) => (
          <button
            key={s}
            type="button"
            className={`category-swatch${color === s ? ' category-swatch-active' : ''}`}
            style={{ background: s }}
            onClick={() => setColor(s)}
            aria-label={`Choose color ${s}`}
          />
        ))}
      </div>
      <div className="category-row-actions">
        <button type="button" onClick={() => onSave({ name, icon, color, monthly_budget: budget ? Number(budget) : null, is_essential: essential })}>
          Save
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  )
}
