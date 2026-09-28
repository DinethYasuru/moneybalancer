import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Debt, DebtType, DeductionTrigger } from '../lib/types'

export function useDebts() {
  const { user } = useAuth()
  const [debts, setDebts] = useState<Debt[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('debts').select('*').eq('is_active', true).order('current_balance', { ascending: false })
    setDebts(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addDebt(input: {
    name: string
    debt_type: DebtType
    lender: string | null
    principal_amount: number | null
    current_balance: number
    interest_rate: number | null
    minimum_payment: number | null
    due_day: number | null
    auto_deduct: boolean
    deduction_trigger: DeductionTrigger | null
  }) {
    if (!user) return { error: 'Not signed in' }
    const { error } = await supabase.from('debts').insert({ user_id: user.id, ...input })
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  /** Logs a payment as a real expense (linked back to the debt) and reduces the debt's balance. */
  async function logPayment(debtId: string, amount: number, date: string, categoryId: string | null) {
    if (!user) return { error: 'Not signed in' }
    const debt = debts.find((d) => d.id === debtId)
    if (!debt) return { error: 'Debt not found' }

    const { error: expenseError } = await supabase.from('expenses').insert({
      user_id: user.id,
      category_id: categoryId,
      amount,
      description: `${debt.name} payment`,
      expense_date: date,
      debt_id: debtId,
    })
    if (expenseError) return { error: expenseError.message }

    const newBalance = Math.max(debt.current_balance - amount, 0)
    const { error: debtError } = await supabase.from('debts').update({ current_balance: newBalance }).eq('id', debtId)
    if (!debtError) await refresh()
    return { error: debtError?.message ?? null }
  }

  async function closeDebt(id: string) {
    const { error } = await supabase.from('debts').update({ is_active: false }).eq('id', id)
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  return { debts, loading, refresh, addDebt, logPayment, closeDebt }
}
