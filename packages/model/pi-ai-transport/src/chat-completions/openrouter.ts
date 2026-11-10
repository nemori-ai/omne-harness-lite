// The official model provider body of OpenRouter (model design「凭据的范围」): the gateway this engine
// is the implementation of. The body is an asset body of the category `model-provider`; the
// release pins it, and the assembly derives the route and the credential settings from it. Its
// accounting is what the decoder reports for a response of this provider.
import { readJsonText, type JsonValue } from '@omne-harness/json-text'
import type { RouteAccounting } from '../config.ts'

/** The accounting of OpenRouter responses: served places under `openrouter/`, costs in credits. */
export const OPENROUTER_ACCOUNTING: RouteAccounting = Object.freeze({
  place: 'openrouter',
  costUnit: 'openrouter-credit',
})

const OPENROUTER_BODY_TEXT = JSON.stringify({
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

const read = readJsonText(OPENROUTER_BODY_TEXT, {
  maxBytes: 4096,
  maxDepth: 8,
  maxItems: 16,
  maxMembers: 16,
  maxStringLength: 400,
  maxNumberLength: 20,
})
if (read.kind !== 'ok') throw new TypeError('the OpenRouter provider body is not a document')

/** The asset body of the official model provider `openrouter`. */
export const OPENROUTER_PROVIDER_BODY: JsonValue = read.value
