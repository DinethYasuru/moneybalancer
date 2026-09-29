import { useEffect, useState } from 'react'
import type { HealthScore } from '../lib/cashflow'
import './HealthScoreGauge.css'

const RADIUS = 44
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--color-success)'
  if (score >= 60) return '#8bd450'
  if (score >= 40) return 'var(--color-warning)'
  if (score >= 20) return '#f08a4b'
  return 'var(--color-danger)'
}

export function HealthScoreGauge({ health }: { health: HealthScore }) {
  const [animatedScore, setAnimatedScore] = useState(0)

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimatedScore(health.score))
    return () => cancelAnimationFrame(t)
  }, [health.score])

  const offset = CIRCUMFERENCE * (1 - animatedScore / 100)
  const color = scoreColor(health.score)

  return (
    <div className="health-gauge card">
      <div className="health-gauge-top">
        <div className="health-gauge-visual">
          <svg viewBox="0 0 100 100" width="100" height="100">
            <circle cx="50" cy="50" r={RADIUS} className="health-gauge-track" />
            <circle
              cx="50"
              cy="50"
              r={RADIUS}
              className="health-gauge-fill"
              style={{ stroke: color, strokeDasharray: CIRCUMFERENCE, strokeDashoffset: offset }}
            />
          </svg>
          <div className="health-gauge-number">
            <span className="health-gauge-score">{Math.round(animatedScore)}</span>
            <span className="health-gauge-max">/100</span>
          </div>
        </div>
        <div className="health-gauge-info">
          <span className="health-gauge-title">Financial health</span>
          <span className="health-gauge-label" style={{ color }}>
            {health.label}
          </span>
        </div>
      </div>

      <ul className="health-gauge-components">
        {health.components.map((c) => (
          <li key={c.label}>
            <span>{c.label}</span>
            <div className="health-gauge-mini-bar">
              <div className="health-gauge-mini-fill" style={{ width: `${c.score}%`, background: scoreColor(c.score) }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
