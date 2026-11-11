// The official OpenRouter provider body (model design「凭据的范围」): the release ships this document
// as the body of the asset `model-provider/openrouter`, so each field is part of what a deployment
// runs with. The assembly sends with a bearer of the one credential item, and the decoder reports
// the accounting that the body declares.
import {
  OPENROUTER_ACCOUNTING,
  OPENROUTER_PROVIDER_BODY_TEXT,
} from '@omne-harness/pi-ai-transport/chat-completions'
import { describe, expect, it } from 'vitest'

describe('the OpenRouter provider body', () => {
  it('names openrouter, its streaming endpoint, the decoder accounting and the one apiKey item', () => {
    expect(JSON.parse(OPENROUTER_PROVIDER_BODY_TEXT)).toEqual({
      name: 'openrouter',
      protocol: 'chat-completions',
      endpoint: { url: 'https://openrouter.ai/api/v1/chat/completions', endMarker: '[DONE]' },
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
