/**
 * Best-effort category guess from a bank transaction's description, using
 * common merchant/keyword patterns. This is a starting point only — the
 * review table always lets the user correct it before saving.
 */
const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ['Rent', /\b(rent|landlord|lease)\b/i],
  ['Electricity', /\b(ceb|electricity|elec\.?\s?board|lecco)\b/i],
  ['Water', /\b(nwsdb|water\s?board)\b/i],
  ['Internet', /\b(slt|dialog|mobitel|hutch|airtel|internet|broadband|wifi|adsl|fibre|fiber)\b/i],
  ['Groceries', /\b(keells|cargills|arpico|foodcity|food\s?city|supermarket|grocery|groceries)\b/i],
  ['Transport', /\b(fuel|petrol|diesel|filling\s?station|uber|pickme|kangaroo|taxi|transport|railway|sltb)\b/i],
  ['Dining Out', /\b(restaurant|cafe|bakers?|bakery|kfc|pizza|dominos|burger|dining|hotel|bar\b)\b/i],
  ['Subscriptions', /\b(netflix|spotify|prime\s?video|subscription|youtube\s?premium|disney)\b/i],
  ['Health', /\b(pharmacy|hospital|clinic|health|medical|hemas|nawaloka)\b/i],
]

export function guessCategoryName(description: string): string | null {
  for (const [name, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(description)) return name
  }
  return null
}

/**
 * Reduces a raw transaction description down to a stable "merchant key" so
 * repeat charges from the same merchant (with different reference numbers,
 * masked card digits, or branch codes) group together for the merchant
 * memory feature — e.g. "POS/KEELLS SUPER - BIYAG" and "POS/KEELLS SUPER -
 * MAWAR" both key to "keells super".
 */
export function normalizeMerchant(description: string): string {
  let s = description.trim()
  s = s.replace(/^(POS|ECOM|MB|IB|ATM WTD\+CHGS|ATM\+CHG|ATM)[:/]\s*/i, '')
  s = s.replace(/x{4,}\d*/gi, ' ')
  s = s.replace(/#?\d{4,}/g, ' ')
  s = s.replace(/\s*-\s*[A-Za-z]+$/i, '') // trailing " - BIYAG" branch/location suffix
  s = s.replace(/[^a-zA-Z& ]+/g, ' ')
  s = s.replace(/\s{2,}/g, ' ').trim().toLowerCase()
  return s
}
