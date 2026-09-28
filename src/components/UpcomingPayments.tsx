import type { UpcomingPayment } from '../lib/upcoming'
import { formatMoney } from '../lib/format'
import './UpcomingPayments.css'

function dueLabel(item: UpcomingPayment): string {
  if (item.isPaid) return 'Paid'
  if (item.isOverdue) return 'Overdue'
  if (item.daysUntil === 0) return 'Due today'
  if (item.daysUntil === 1) return 'Due tomorrow'
  return `Due in ${item.daysUntil} days`
}

export function UpcomingPayments({ items, currency }: { items: UpcomingPayment[]; currency: string }) {
  const visible = items.filter((i) => !i.isPaid).slice(0, 6)

  return (
    <div className="upcoming-payments card">
      <h3 className="upcoming-payments-title">Upcoming bills &amp; payments</h3>
      {visible.length === 0 ? (
        <p className="upcoming-payments-empty">Nothing due — you're all caught up.</p>
      ) : (
        <ul className="stagger">
          {visible.map((item) => (
            <li key={`${item.kind}-${item.id}`} className={item.isOverdue ? 'upcoming-overdue' : ''}>
              <span className="upcoming-icon" style={{ background: `${item.color}22`, color: item.color }}>
                {item.icon}
              </span>
              <span className="upcoming-main">
                <span className="upcoming-name">{item.name}</span>
                <span className={`upcoming-due ${item.isOverdue ? 'upcoming-due-danger' : ''}`}>{dueLabel(item)}</span>
              </span>
              <span className="upcoming-amount">{item.amount > 0 ? formatMoney(item.amount, currency) : '—'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
