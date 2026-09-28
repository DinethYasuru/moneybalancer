import { useState } from 'react'
import type { Insight } from '../lib/analysis'
import './InsightCards.css'

const TYPE_LABEL: Record<Insight['type'], string> = {
  danger: 'Needs attention',
  warning: 'Watch this',
  tip: 'Savings tip',
  success: 'Nice work',
}

export function InsightCards({ insights }: { insights: Insight[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const visible = insights.filter((i) => !dismissed.has(i.id))

  if (visible.length === 0) {
    return <p className="insight-cards-empty">All caught up — dismissed everything for now.</p>
  }

  return (
    <div className="insight-cards-row stagger">
      {visible.map((insight) => (
        <article key={insight.id} className={`insight-card insight-${insight.type}`}>
          <button
            type="button"
            className="insight-dismiss"
            aria-label="Dismiss"
            onClick={() => setDismissed((prev) => new Set(prev).add(insight.id))}
          >
            ×
          </button>
          <span className="insight-icon">{insight.icon}</span>
          <span className="insight-type-label">{TYPE_LABEL[insight.type]}</span>
          <h4 className="insight-headline">{insight.headline}</h4>
          <p className="insight-detail">{insight.detail}</p>
        </article>
      ))}
    </div>
  )
}
