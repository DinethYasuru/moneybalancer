import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { SavingsGoal } from '../lib/types'

export function useSavingsGoals() {
  const { user } = useAuth()
  const [goals, setGoals] = useState<SavingsGoal[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('savings_goals').select('*').order('created_at')
    setGoals(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addGoal(input: { name: string; target_amount: number; target_date: string | null }) {
    if (!user) return { error: 'Not signed in' }
    const { error } = await supabase.from('savings_goals').insert({ user_id: user.id, ...input })
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  async function addContribution(id: string, amount: number) {
    const goal = goals.find((g) => g.id === id)
    if (!goal) return { error: 'Goal not found' }
    const { error } = await supabase
      .from('savings_goals')
      .update({ current_amount: goal.current_amount + amount })
      .eq('id', id)
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  async function deleteGoal(id: string) {
    const { error } = await supabase.from('savings_goals').delete().eq('id', id)
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  return { goals, loading, refresh, addGoal, addContribution, deleteGoal }
}
