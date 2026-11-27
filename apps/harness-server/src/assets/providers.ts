// The model providers the release brings, as their official assets hold them. The catalog of each
// is added from the official profiles when the release reads it.

const OPENROUTER_BODY = {
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
  accounting: {
    place: 'openrouter',
    costUnit: 'openrouter-credit',
    generation: { requestHeader: 'x-generation-id', path: '/api/v1/generation' },
  },
  credentials: [
    {
      item: 'apiKey',
      title: 'OpenRouter 的 API 密钥',
      description: '调用 OpenRouter 上的模型时带的密钥：填你自己在 OpenRouter 上建的那一把。',
      impact: '下一次模型请求起用新的密钥。',
      clear: '清除之后用部署层的密钥；部署层也没有时，模型请求带不上凭据，会失败。',
    },
  ],
}

// OpenAI reports no cost on a reply and answers no lookup of one: its costs stay unknown.
const OPENAI_BODY = {
  name: 'openai',
  endpoints: [
    { protocol: 'responses', url: 'https://api.openai.com/v1/responses' },
    { protocol: 'decisions-v1', url: 'https://api.openai.com/v1/decisions' },
    { protocol: 'live-sessions', url: 'wss://api.openai.com/v1/live/sessions' },
  ],
  accounting: { place: 'openai', costUnit: 'usd' },
  credentials: [
    {
      item: 'apiKey',
      title: 'OpenAI 的 API 密钥',
      description: '直连 OpenAI 的模型时带的密钥：填你自己在 OpenAI 平台上建的那一把。',
      impact: '下一次模型请求起用新的密钥。',
      clear: '清除之后用部署层的密钥；部署层也没有时，模型请求带不上凭据，会失败。',
    },
  ],
}

/** The base body of every provider the release brings, in the order the assets page shows them. */
export const RELEASE_PROVIDER_TEXTS: readonly string[] = [OPENROUTER_BODY, OPENAI_BODY].map(body =>
  JSON.stringify(body),
)
