import type { RouteAccounting } from '../config.ts'

export const OPENROUTER_ACCOUNTING: RouteAccounting = Object.freeze({
  place: 'openrouter',
  costUnit: 'openrouter-credit',
})

export const OPENROUTER_PROVIDER_BODY_TEXT: string = JSON.stringify({
  name: 'openrouter',
  protocol: 'chat-completions',
  endpoint: { url: 'https://openrouter.ai/api/v1/chat/completions', endMarker: '[DONE]' },
  accounting: OPENROUTER_ACCOUNTING,
  credentials: [
    {
      item: 'apiKey',
      title: 'OpenRouter API key',
      description: 'The API key that model requests send to OpenRouter.',
      impact: 'The next model request uses the new key.',
      clear:
        'Official models use the deployment default key; without one, model requests have no credential.',
    },
  ],
})
