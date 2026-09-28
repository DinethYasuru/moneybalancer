import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Category } from '../lib/types'

export function useCategories() {
  const { user } = useAuth()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('categories').select('*').order('name')
    setCategories(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function addCategory(input: { name: string; icon: string; color: string }) {
    if (!user) return { error: 'Not signed in' }
    const { error } = await supabase.from('categories').insert({
      user_id: user.id,
      name: input.name,
      icon: input.icon || null,
      color: input.color,
    })
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  async function updateCategory(id: string, patch: { name?: string; icon?: string; color?: string }) {
    const { error } = await supabase.from('categories').update(patch).eq('id', id)
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  async function deleteCategory(id: string) {
    const { error } = await supabase.from('categories').delete().eq('id', id)
    if (!error) await refresh()
    return { error: error?.message ?? null }
  }

  return { categories, loading, refresh, addCategory, updateCategory, deleteCategory }
}
