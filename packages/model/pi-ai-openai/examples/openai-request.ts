// One request to an OpenAI model through OpenRouter, with the real shared transport.
//
// The history holds an earlier tool turn written as data: an assistant message that has only a tool
// call, then a tool result without content. The OpenAI records write content in the compact form,
// so both go out as an empty string. The last user message carries a small image, which the
// records write with the detail `auto`.
//
// Run from the package directory after building: node --experimental-strip-types examples/openai-request.ts
// HTTPS_PROXY must point to the proxy that adds the OpenRouter credential.
import {
  createOpenAiFamily,
  officialOpenAiProfiles,
  openAiTokenizerResources,
} from '@omne-harness/pi-ai-openai'
import {
  closeTransport,
  executeOnce,
  exampleAdoption,
  fixRequest,
  openTransport,
  profileOf,
  RETRY_POLICY,
} from './support.ts'

/** A reasoning model of the OpenAI family. */
const MODEL = 'openai/gpt-5.6-luna'

const SHOWN = { toHuman: true, toModel: true }
/** A 16 by 16 red PNG. */
const RED_SQUARE =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IydHEmIY1TCqYfhqAACaMxgQdGu1YAAAAABJRU5ErkJggg=='

const family = createOpenAiFamily({
  tokenizer: openAiTokenizerResources(),
  limits: {
    toolArguments: {
      maxBytes: 65_536,
      maxDepth: 32,
      maxItems: 1_024,
      maxMembers: 256,
      maxStringLength: 65_536,
      maxNumberLength: 64,
    },
    maxReasoningText: 1_048_576,
  },
  margin: { percent: '10', source: exampleAdoption('margin-policy') },
})
const profile = profileOf(
  officialOpenAiProfiles({ retryPolicy: RETRY_POLICY, compactionTriggerPercent: '80' }),
  MODEL,
)

console.log(`model: ${MODEL}`)
const request = await fixRequest([family], profile, {
  system: [{ kind: 'text', id: 's1', visibility: SHOWN, text: 'Answer in one short sentence.' }],
  messages: [
    {
      id: 'msg_example-user-question-1',
      role: 'user',
      blocks: [
        { kind: 'text', id: 'b1', visibility: SHOWN, text: 'Look up the capital of France.' },
      ],
    },
    {
      // Only a tool call: the body writes its content as an empty string.
      id: 'msg_example-assistant-tool-1',
      role: 'assistant',
      blocks: [
        {
          kind: 'tool_call',
          id: 'c1',
          visibility: SHOWN,
          callId: 'call_lookup_1',
          name: 'lookup',
          arguments: {
            kind: 'object',
            entries: [{ key: 'query', value: { kind: 'string', value: 'capital of France' } }],
          },
        },
      ],
    },
    {
      // A tool result without content: the body writes its content as an empty string.
      id: 'msg_example-tool-result-01',
      role: 'tool',
      blocks: [{ kind: 'tool_result', id: 'r1', visibility: SHOWN, callId: 'call_lookup_1' }],
    },
    {
      id: 'msg_example-user-question-2',
      role: 'user',
      blocks: [
        {
          kind: 'text',
          id: 'b2',
          visibility: SHOWN,
          text: 'The lookup returned nothing. Name the capital of France and the color of this square.',
        },
        { kind: 'image', id: 'i1', visibility: SHOWN, mediaType: 'image/png', inline: RED_SQUARE },
      ],
    },
  ],
  tools: [
    {
      name: 'lookup',
      description: 'Looks up a fact.',
      argumentsSchema: {
        kind: 'object',
        entries: [
          { key: 'type', value: { kind: 'string', value: 'object' } },
          {
            key: 'properties',
            value: {
              kind: 'object',
              entries: [
                {
                  key: 'query',
                  value: {
                    kind: 'object',
                    entries: [{ key: 'type', value: { kind: 'string', value: 'string' } }],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  ],
  toolChoice: 'none',
  parameters: [
    { kind: 'reasoning-effort', value: 'low' },
    { kind: 'max-output-tokens', value: '1024' },
  ],
})

const open = openTransport([family])
try {
  await executeOnce(open, request)
} finally {
  await closeTransport(open)
}
