// The official model provider body of OpenRouter (model design「凭据的范围」): the gateway this engine
// is the implementation of. The body is the document text of an asset of the category
// `model-provider`; the release reads it through the asset domain and pins it, and the assembly
// derives the route and the credential settings from it. Its accounting is what the decoder
// reports for a response of this provider.
import type { RouteAccounting } from '../config.ts'

/** The accounting of OpenRouter responses: served places under `openrouter/`, costs in credits. */
export const OPENROUTER_ACCOUNTING: RouteAccounting = Object.freeze({
  place: 'openrouter',
  costUnit: 'openrouter-credit',
})

/** The asset body document of the official model provider `openrouter`. */
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

