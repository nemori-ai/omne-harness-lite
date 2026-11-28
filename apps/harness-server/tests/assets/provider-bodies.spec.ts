import { describe, expect, it } from 'vitest'
import { releaseProvider } from '../../src/assets/model-providers.ts'

const bodyOf = (name: string) => {
  const { models: _catalog, ...body } = releaseProvider(name)?.body ?? {}
  return body
}

describe('the provider bodies of the release', () => {
  it('OpenRouter: its streaming and decisions endpoints, an accounting that looks a cost up, and the one apiKey item', () => {
    expect(bodyOf('openrouter')).toEqual({
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
    })
  })

  it('OpenAI: its Responses, decisions and live sessions endpoints without an end marker, an accounting with no lookup, and the one apiKey item', () => {
    expect(bodyOf('openai')).toEqual({
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
    })
  })
})
