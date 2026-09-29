import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Expense } from '../lib/types'
import { useCategories } from '../hooks/useCategories'
import { ExpenseForm } from '../components/ExpenseForm'
import { ExpenseList } from '../components/ExpenseList'
import './Expenses.css'

export function Expenses() {
  const { user } = useAuth()
  const { categories, loading: categoriesLoading } = useCategories()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const loadExpenses = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .limit(80)
    setExpenses(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  async function deleteExpense(id: string) {
    await supabase.from('expenses').delete().eq('id', id)
    setExpenses((prev) => prev.filter((e) => e.id !== id))
  }

  if (loading || categoriesLoading) return <p>Loading…</p>

  return (
    <div className="expenses-page page-enter">
      <h2>Expenses</h2>
      <div className="expenses-grid">
        <ExpenseForm categories={categories} onSaved={loadExpenses} />
        <ExpenseList expenses={expenses} categories={categories} onDelete={deleteExpense} />
      </div>
    </div>
  )
}
