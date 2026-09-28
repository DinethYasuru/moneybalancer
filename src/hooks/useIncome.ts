import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Income, IncomeFrequency } from '../lib/types'

export function useIncome() {
  const { user } = useAuth()
  const [income, setIncome] = useState<Income[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('income').select('*').order('received_date', { ascending: false })
    setIncome(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addIncome(input: { source: string; amount: number; frequency: IncomeFrequency; received_date: string; is_recurring: boolean }) {
    if (!user) return { error: 'Not signed in' }
    const { error } = await supabase.from('income').insert({ user_id: user.id, ...input })
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  async function deleteIncome(id: string) {
    const { error } = await supabase.from('income').delete().eq('id', id)
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  return { income, loading, refresh, addIncome, deleteIncome }
}

/** Normalizes any income frequency to an equivalent monthly amount for cash-flow math. */
export function monthlyEquivalent(amount: number, frequency: IncomeFrequency): number {
  switch (frequency) {
    case 'weekly':
      return amount * 4.33
    case 'biweekly':
      return amount * 2.17
    case 'one_time':
      return 0
    default:
      return amount
  }
}
