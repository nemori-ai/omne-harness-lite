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
        { protocol: 'responses', url: 'https://openrouter.ai/api/v1/responses' },
      ],
      accounting: { ...OPENROUTER_ACCOUNTING },
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
    expect(OPENROUTER_ACCOUNTING).toEqual({ place: 'openrouter', costUnit: 'openrouter-credit' })
  })
})
