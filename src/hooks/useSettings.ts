import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { UserSettings } from '../lib/types'

const DEFAULTS: Omit<UserSettings, 'user_id'> = {
  currency: 'LKR',
  accent_color: '#8b7ef5',
  dashboard_widgets: { income: true, debt: true, safeToSpend: true },
  ai_config: { enabled: false, provider: 'openai_compatible', base_url: 'https://api.openai.com/v1', api_key: '', model: 'gpt-4o-mini' },
}

export function useSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.from('user_settings').select('*').eq('user_id', user.id).maybeSingle()
    // Merge over defaults rather than trusting the row shape outright — a
    // pending migration can mean a column (e.g. ai_config) doesn't exist
    // yet, and an old saved row simply won't have newer fields.
    setSettings({ ...DEFAULTS, ...data, user_id: user.id })
    setLoading(false)
  }, [user])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function updateSettings(patch: Partial<Omit<UserSettings, 'user_id'>>) {
    if (!user) return { error: 'Not signed in' }
    const next = { ...(settings ?? { user_id: user.id, ...DEFAULTS }), ...patch }
    const { error } = await supabase.from('user_settings').upsert({ ...next, user_id: user.id, updated_at: new Date().toISOString() })
    if (!error) setSettings(next)
    return { error: error?.message ?? null }
  }

  return { settings: settings ?? { user_id: user?.id ?? '', ...DEFAULTS }, loading, updateSettings }
}
