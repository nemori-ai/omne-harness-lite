import type { RouteAccounting } from '../config.ts'

export const OPENROUTER_ACCOUNTING: RouteAccounting = Object.freeze({
  place: 'openrouter',
  costUnit: 'openrouter-credit',
  generation: Object.freeze({ requestHeader: 'x-generation-id', path: '/api/v1/generation' }),
})

export const OPENROUTER_PROVIDER_BODY_TEXT: string = JSON.stringify({
  name: 'openrouter',
  endpoints: [
    {
      protocol: 'chat-completions',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      endMarker: '[DONE]',
    },
    { protocol: 'messages', url: 'https://openrouter.ai/api/v1/messages' },
    {
      protocol: 'responses',
      url: 'https://openrouter.ai/api/v1/responses',
      endMarker: '[DONE]',
    },
    { protocol: 'decisions', url: 'https://openrouter.ai/api/alpha/decisions' },
  ],
  accounting: OPENROUTER_ACCOUNTING,
  credentials: [
    {
      item: 'apiKey',
      title: 'OpenRouter 的 API 密钥',
      description: '调用 OpenRouter 上的模型时带的密钥：填你自己在 OpenRouter 上建的那一把。',
      impact: '下一次模型请求起用新的密钥。',
      clear: '清除之后用部署层的密钥；部署层也没有时，模型请求带不上凭据，会失败。',
    },
  ],
})
