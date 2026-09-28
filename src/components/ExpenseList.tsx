import type { Category, Expense } from '../lib/types'
import './ExpenseList.css'

interface ExpenseListProps {
  expenses: Expense[]
  categories: Category[]
}

export function ExpenseList({ expenses, categories }: ExpenseListProps) {
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)
  const total = expenses.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="expense-list card">
      <div className="expense-list-header">
        <h2>Recent expenses</h2>
        <span className="expense-list-total">Total: {total.toFixed(2)}</span>
      </div>

      {expenses.length === 0 ? (
        <p className="expense-list-empty">No expenses yet. Add your first one above.</p>
      ) : (
        <ul>
          {expenses.map((e) => {
            const cat = categoryOf(e.category_id)
            return (
              <li key={e.id}>
                <div className="expense-list-main">
                  <span
                    className="expense-list-category"
                    style={{ background: `${cat?.color ?? '#6b7280'}22`, color: cat?.color ?? '#6b7280' }}
                  >
                    {cat?.icon} {cat?.name ?? 'Uncategorized'}
                  </span>
                  <span className="expense-list-desc">{e.description}</span>
                </div>
                <div className="expense-list-meta">
                  <span>{e.expense_date}</span>
                  <span className="expense-list-amount">{e.currency} {e.amount.toFixed(2)}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
