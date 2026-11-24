import {
  OPENROUTER_ACCOUNTING,
  OPENROUTER_PROVIDER_BODY_TEXT,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { describe, expect, it } from 'vitest'

describe('the OpenRouter provider body', () => {
  it('names openrouter, its three streaming endpoints, the decoder accounting and the one apiKey item', () => {
    expect(JSON.parse(OPENROUTER_PROVIDER_BODY_TEXT)).toEqual({
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
      ],
      accounting: { ...OPENROUTER_ACCOUNTING },
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
    expect(OPENROUTER_ACCOUNTING).toEqual({ place: 'openrouter', costUnit: 'openrouter-credit' })
  })
})
