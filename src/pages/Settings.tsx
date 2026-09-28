import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { testAiConnection } from '../lib/ai'
import type { AiProvider } from '../lib/types'
import './Settings.css'

const CURRENCIES = ['LKR', 'USD', 'INR', 'GBP', 'EUR', 'AUD']
const ACCENTS = ['#8b7ef5', '#2dd4bf', '#f36a82', '#f3b95f', '#35d399', '#5b9cf5', '#e879c9']

const PROVIDER_DEFAULTS: Record<AiProvider, { base_url: string; model: string }> = {
  openai_compatible: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { base_url: 'https://api.anthropic.com/v1', model: 'claude-haiku-4-5-20251001' },
}

export function Settings() {
  const { settings, loading, updateSettings } = useSettings()
  const [saved, setSaved] = useState(false)
  const [aiDraft, setAiDraft] = useState(settings.ai_config)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)

  // Settings load asynchronously after first render, so the draft must be
  // re-synced once the real saved value arrives — otherwise this always
  // shows the pre-load default (AI off) even when it's actually saved on.
  useEffect(() => {
    if (!loading) setAiDraft(settings.ai_config)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const [saveError, setSaveError] = useState<string | null>(null)

  async function handleChange(patch: Partial<typeof settings>) {
    const { error } = await updateSettings(patch)
    if (error) {
      setSaveError(error)
      return
    }
    setSaveError(null)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function handleAiSave() {
    const cleaned = { ...aiDraft, api_key: aiDraft.api_key.trim(), base_url: aiDraft.base_url.trim().replace(/\/+$/, ''), model: aiDraft.model.trim() }
    setAiDraft(cleaned)
    await handleChange({ ai_config: cleaned })
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const result = await testAiConnection(aiDraft)
    setTesting(false)
    setTestResult(result.ok ? { ok: true, message: 'Connected successfully.' } : { ok: false, message: result.error ?? 'Failed to connect.' })
  }

  return (
    <div className="settings-page page-enter">
      <h2>Settings</h2>
      <p className="settings-hint">Make MoneyBalancer feel like yours.</p>

      <div className="card settings-section">
        <h3>Currency</h3>
        <div className="settings-options">
          {CURRENCIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`settings-chip${settings.currency === c ? ' settings-chip-active' : ''}`}
              onClick={() => handleChange({ currency: c })}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="card settings-section">
        <h3>Accent color</h3>
        <div className="settings-swatches">
          {ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              className={`settings-swatch${settings.accent_color === color ? ' settings-swatch-active' : ''}`}
              style={{ background: color }}
              onClick={() => handleChange({ accent_color: color })}
              aria-label={`Use accent ${color}`}
            />
          ))}
        </div>
      </div>

      <div className="card settings-section">
        <h3>Dashboard widgets</h3>
        <p className="settings-section-hint">Choose what shows up on your dashboard overview.</p>
        <div className="settings-toggles">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.dashboard_widgets.income}
              onChange={(e) => handleChange({ dashboard_widgets: { ...settings.dashboard_widgets, income: e.target.checked } })}
            />
            Income vs. spending
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.dashboard_widgets.debt}
              onChange={(e) => handleChange({ dashboard_widgets: { ...settings.dashboard_widgets, debt: e.target.checked } })}
            />
            Debt summary
          </label>
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={settings.dashboard_widgets.safeToSpend}
              onChange={(e) => handleChange({ dashboard_widgets: { ...settings.dashboard_widgets, safeToSpend: e.target.checked } })}
            />
            Safe-to-spend-today
          </label>
        </div>
      </div>

      <div className="card settings-section">
        <h3>AI integration</h3>
        <p className="settings-section-hint">
          Bring your own AI model to auto-read photographed bank slips and passbook pages — this app has no server of
          its own, so your API key is used only from your browser, straight to the provider you choose. It's stored
          in your account, visible only to you.
        </p>

        <label className="settings-toggle" style={{ marginBottom: '0.8rem' }}>
          <input type="checkbox" checked={aiDraft.enabled} onChange={(e) => setAiDraft({ ...aiDraft, enabled: e.target.checked })} />
          Enable AI-assisted slip reading
        </label>

        {aiDraft.enabled && (
          <div className="ai-settings-fields">
            <label>
              Provider
              <select
                value={aiDraft.provider}
                onChange={(e) => {
                  const provider = e.target.value as AiProvider
                  setAiDraft({ ...aiDraft, provider, ...PROVIDER_DEFAULTS[provider] })
                }}
              >
                <option value="openai_compatible">OpenAI-compatible (OpenAI, Groq, OpenRouter, local Ollama, …)</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>
            </label>
            <label>
              Base URL
              <input value={aiDraft.base_url} onChange={(e) => setAiDraft({ ...aiDraft, base_url: e.target.value })} />
            </label>
            <label>
              Model
              <input value={aiDraft.model} onChange={(e) => setAiDraft({ ...aiDraft, model: e.target.value })} placeholder="e.g. gpt-4o-mini" />
            </label>
            <label>
              API key
              <input
                type="password"
                value={aiDraft.api_key}
                onChange={(e) => setAiDraft({ ...aiDraft, api_key: e.target.value })}
                placeholder="sk-…"
                autoComplete="off"
              />
            </label>

            <div className="ai-settings-actions">
              <button type="button" onClick={handleAiSave}>
                Save AI settings
              </button>
              <button type="button" onClick={handleTest} disabled={testing || !aiDraft.api_key}>
                {testing ? 'Testing…' : 'Test connection'}
              </button>
            </div>
            {testResult && <p className={testResult.ok ? 'settings-saved' : 'settings-ai-error'}>{testResult.message}</p>}
          </div>
        )}
      </div>

      {saved && <p className="settings-saved">Saved</p>}
      {saveError && <p className="settings-ai-error">Failed to save: {saveError}</p>}
    </div>
  )
}
