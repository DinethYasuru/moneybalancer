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
