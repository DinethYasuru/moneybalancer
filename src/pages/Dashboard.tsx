import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Expense } from '../lib/types'
import { useCategories } from '../hooks/useCategories'
import { ExpenseForm } from '../components/ExpenseForm'
import { ExpenseList } from '../components/ExpenseList'
import './Dashboard.css'

export function Dashboard() {
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
      .limit(50)
    setExpenses(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  if (loading || categoriesLoading) return <p>Loading…</p>

  return (
    <div className="dashboard-grid">
      <ExpenseForm categories={categories} onSaved={loadExpenses} />
      <ExpenseList expenses={expenses} categories={categories} />
    </div>
  )
}
