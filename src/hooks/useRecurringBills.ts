import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { RecurringBill } from '../lib/types'

export function useRecurringBills() {
  const { user } = useAuth()
  const [bills, setBills] = useState<RecurringBill[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('recurring_bills')
      .select('*')
      .eq('is_active', true)
      .order('due_day', { ascending: true, nullsFirst: false })
    setBills(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addBill(input: { name: string; category_id: string | null; expected_amount: number | null; due_day: number | null }) {
    if (!user) return { error: 'Not signed in' }
    const { error } = await supabase.from('recurring_bills').insert({ user_id: user.id, ...input })
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  async function updateBill(id: string, patch: Partial<Pick<RecurringBill, 'name' | 'category_id' | 'expected_amount' | 'due_day'>>) {
    const { error } = await supabase.from('recurring_bills').update(patch).eq('id', id)
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  async function deleteBill(id: string) {
    const { error } = await supabase.from('recurring_bills').update({ is_active: false }).eq('id', id)
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  return { bills, loading, refresh, addBill, updateBill, deleteBill }
}
