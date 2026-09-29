import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { normalizeMerchant, guessCategoryName } from '../lib/categorize'
import type { Category } from '../lib/types'

export function useMerchantMemory() {
  const { user } = useAuth()
  const [memory, setMemory] = useState<Map<string, string>>(new Map())

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('merchant_categories').select('merchant_key, category_id')
    setMemory(new Map((data ?? []).map((r) => [r.merchant_key, r.category_id])))
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  /** Merchant memory first (learned from past corrections), then static keyword guess, then a fallback category. */
  function guessCategoryId(description: string, categories: Category[]): string {
    const key = normalizeMerchant(description)
    const remembered = key ? memory.get(key) : undefined
    if (remembered && categories.some((c) => c.id === remembered)) return remembered

    const guessedName = guessCategoryName(description)
    const match = guessedName ? categories.find((c) => c.name.toLowerCase() === guessedName.toLowerCase()) : null
    return match?.id ?? categories.find((c) => c.name === 'Other')?.id ?? categories[0]?.id ?? ''
  }

  /** Call after the user confirms/saves an expense so the same merchant is remembered next time. */
  async function learn(description: string, categoryId: string) {
    if (!user || !categoryId) return
    const key = normalizeMerchant(description)
    if (!key) return
    await supabase
      .from('merchant_categories')
      .upsert({ user_id: user.id, merchant_key: key, category_id: categoryId, updated_at: new Date().toISOString() }, { onConflict: 'user_id,merchant_key' })
    setMemory((prev) => new Map(prev).set(key, categoryId))
  }

  return { guessCategoryId, learn, refresh }
}
