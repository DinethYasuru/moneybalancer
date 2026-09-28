/**
 * Formats an amount with thousand separators and a currency code prefix,
 * e.g. formatMoney(306000, 'LKR') -> "LKR 306,000.00". Used everywhere a
 * money value is displayed, so numbers are never shown as bare digits.
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      currencyDisplay: 'code',
    }).format(amount)
  } catch {
    // Unknown/invalid ISO currency code — fall back to plain grouped digits.
    return `${currency} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
  }
}
