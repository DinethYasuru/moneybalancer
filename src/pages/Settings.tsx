import { useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import './Settings.css'

const CURRENCIES = ['LKR', 'USD', 'INR', 'GBP', 'EUR', 'AUD']
const ACCENTS = ['#8b7ef5', '#2dd4bf', '#f36a82', '#f3b95f', '#35d399', '#5b9cf5', '#e879c9']

export function Settings() {
  const { settings, updateSettings } = useSettings()
  const [saved, setSaved] = useState(false)

  async function handleChange(patch: Partial<typeof settings>) {
    await updateSettings(patch)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
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
        <p className="settings-section-hint">Choose what shows up on your Expenses page overview.</p>
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

      {saved && <p className="settings-saved">Saved</p>}
    </div>
  )
}
