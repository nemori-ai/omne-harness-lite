import { randomUUID } from 'node:crypto'

const models = new Set([
  'anthropic/claude-opus-5.5',
  'anthropic/claude-opus-5',
  'anthropic/claude-sonnet-5',
  'anthropic/claude-fable-5.1',
])

export function makeManifest(model, ttl = '1h') {
  const path = 'public'
  if (!models.has(model)) throw new Error('unsupported model')
  const nonce = `anthropic-${path}-${model.replaceAll('/', '-')}-${randomUUID()}`
  // Distinct numbered entries avoid relying on a repeated-string token count.
  // The first actual write usage, not this text length, is the cacheability oracle.
  const prefix = Array.from(
    { length: 180 },
    (_, index) =>
      `Catalog entry ${String(index + 1).padStart(4, '0')}: archival weather observations in English, 中文, and JSON {"quality":"observed"}.`,
  ).join('\n')
  return {
    model,
    path,
    nonce,
    implementationRevision: 'mp4-4',
    algorithmRevision: 'anthropic-legacy-bpe-plus-vision-patches-4',
    provider: 'anthropic',
    allowFallback: false,
    parameters: { maxOutputTokens: 512, reasoningEffort: 'low' },
    tokenMargin: { multiplier: 1.2, reserveTokens: 32 },
    configuration: { cache: { mode: 'explicit', ttl, breakpoints: ['last_message'] } },
    tools: [
      {
        name: 'lookup',
        description: 'Return a short weather observation for one city.',
        parameters: {
          type: 'object',
          properties: { city: { type: 'string' } },
          required: ['city'],
          additionalProperties: false,
        },
      },
    ],
    messages: [
      { role: 'system', text: `Cache certification nonce ${nonce}.\n${prefix}` },
      { role: 'user', text: 'Look up Paris weather for the archived example.' },
      {
        role: 'assistant',
        toolCall: { id: 'call_1', name: 'lookup', arguments: { city: 'Paris' } },
      },
      { role: 'tool', callId: 'call_1', text: 'Sunny in Paris.' },
      { role: 'user', text: 'Answer in at most five words.' },
    ],
    phases: [
      { name: 'write', run: 'once', earliest: 'immediate' },
      { name: 'read', run: 'once', latestAfterPreviousCompletionSeconds: 300 },
      {
        name: 'expiry',
        run: 'once',
        earliestAfterPreviousCompletionSeconds: { '1h': 3900, '5m': 600 }[ttl],
      },
    ],
  }
}
