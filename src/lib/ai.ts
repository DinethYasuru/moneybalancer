import type { AiConfig } from './types'

export interface AiTransaction {
  date: string // yyyy-mm-dd
  description: string
  amount: number
  direction: 'debit' | 'credit'
  category: string | null
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1] : trimmed
}

/** Low-level call: sends one user message (text and/or an image) and returns the raw text reply. */
async function callAi(config: AiConfig, systemPrompt: string, userText: string, image?: { base64: string; mimeType: string }): Promise<string> {
  if (config.provider === 'anthropic') {
    const content: unknown[] = []
    if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.mimeType, data: image.base64 } })
    content.push({ type: 'text', text: userText })

    const res = await fetch(`${config.base_url}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.api_key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: config.model, max_tokens: 4096, system: systemPrompt, messages: [{ role: 'user', content }] }),
    })
    if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`)
    const data = await res.json()
    return data.content?.[0]?.text ?? ''
  }

  // OpenAI-compatible chat completions (OpenAI, Groq, OpenRouter, local Ollama, etc.)
  const content: unknown[] = [{ type: 'text', text: userText }]
  if (image) content.push({ type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.base64}` } })

  const res = await fetch(`${config.base_url}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.api_key}` },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    }),
  })
  if (!res.ok) throw new Error(`AI request failed (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

export async function testAiConnection(config: AiConfig): Promise<{ ok: boolean; error?: string }> {
  try {
    const reply = await callAi(config, 'Reply with exactly one word: OK', 'Are you working?')
    return reply.trim().toUpperCase().includes('OK') ? { ok: true } : { ok: true } // any successful reply counts
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

const EXTRACTION_INSTRUCTIONS = (categoryNames: string[]) => `You extract financial transactions from bank statements, passbook pages, and payment slips/receipts.

Categories available (use these exact names when a transaction clearly matches one, otherwise use null): ${categoryNames.join(', ')}.

Reply with ONLY a JSON array (no markdown, no commentary), one object per transaction found:
[{"date":"YYYY-MM-DD","description":"...","amount":1234.56,"direction":"debit"|"credit","category":"<one of the category names above, or null>"}]

Rules:
- "debit" = money going out (an expense/payment). "credit" = money coming in (income/deposit).
- amount is always a positive number.
- If you can't confidently read a value, make your best guess rather than omitting the transaction.
- If there are no transactions visible, reply with []`

async function extractAndParse(
  config: AiConfig,
  categoryNames: string[],
  userText: string,
  image?: { base64: string; mimeType: string },
): Promise<AiTransaction[]> {
  const reply = await callAi(config, EXTRACTION_INSTRUCTIONS(categoryNames), userText, image)
  const jsonText = stripCodeFence(reply)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error(`AI did not return valid JSON: ${reply.slice(0, 200)}`)
  }
  if (!Array.isArray(parsed)) throw new Error('AI response was not a list of transactions.')

  return parsed
    .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null)
    .map((t) => ({
      date: typeof t.date === 'string' ? t.date : new Date().toISOString().slice(0, 10),
      description: typeof t.description === 'string' ? t.description : '(no description)',
      amount: Number(t.amount) || 0,
      direction: (t.direction === 'credit' ? 'credit' : 'debit') as 'debit' | 'credit',
      category: typeof t.category === 'string' ? t.category : null,
    }))
    .filter((t) => t.amount > 0)
}

/** For a photographed slip/passbook page — sends the image directly to a vision-capable model. */
export async function extractTransactionsFromImage(
  base64: string,
  mimeType: string,
  config: AiConfig,
  categoryNames: string[],
): Promise<AiTransaction[]> {
  return extractAndParse(config, categoryNames, 'Extract every transaction visible in this image.', { base64, mimeType })
}

/** For text already extracted from a PDF (used as a fallback/enhancement when the regex parser finds little or nothing). */
export async function extractTransactionsFromText(text: string, config: AiConfig, categoryNames: string[]): Promise<AiTransaction[]> {
  return extractAndParse(config, categoryNames, `Extract every transaction from this statement text:\n\n${text}`)
}
