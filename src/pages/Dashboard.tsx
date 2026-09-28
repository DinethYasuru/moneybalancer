import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Category, Expense } from '../lib/types'
import { ExpenseForm } from '../components/ExpenseForm'
import { ExpenseList } from '../components/ExpenseList'
import './Dashboard.css'

export function Dashboard() {
  const { user, signOut } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!user) return
    const [{ data: cats }, { data: exps }] = await Promise.all([
      supabase.from('categories').select('*').order('name'),
      supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(50),
    ])
    setCategories(cats ?? [])
    setExpenses(exps ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>MoneyBalancer</h1>
        <div className="dashboard-user">
          <span>{user?.email}</span>
          <button onClick={() => signOut()}>Log out</button>
        </div>
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="dashboard-grid">
          <ExpenseForm categories={categories} onSaved={loadData} />
          <ExpenseList expenses={expenses} categories={categories} />
        </div>
      )}
    </div>
  )
}
