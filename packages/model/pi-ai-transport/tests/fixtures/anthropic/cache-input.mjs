import { judgeMessage } from '@omne-harness-lite/messages'
import { parseOpaqueIdentifier, unwrap } from '@omne-harness-lite/identity-values'
import { anthropicDefinitions, createOfficialProfileContent } from '../../../dist/index.js'

const at = '2026-09-28T00:00:00Z'
const visibility = { toHuman: true, toModel: true }

function judged(raw) {
  const result = judgeMessage(raw)
  if ('rejected' in result) throw new Error(`message: ${result.rejected}`)
  return result.ok
}

function mapMessage(item, index) {
  const id = `cache-message-${index}`
  if (item.role === 'assistant') {
    const call = item.toolCall
    return judged({
      type: 'assistant',
      id,
      createdAt: at,
      response: 'prior-response',
      ending: 'complete',
      blocks: [
        {
          id: `${id}-call`,
          kind: 'tool_call',
          callId: call.id,
          tool: call.name,
          complete: true,
          unparseable: true,
          rawArguments: JSON.stringify(call.arguments),
          visibility,
        },
      ],
    })
  }
  if (item.role === 'tool') {
    return judged({
      type: 'tool',
      id,
      callId: item.callId,
      createdAt: at,
      blocks: [
        {
          id: `${id}-result`,
          kind: 'tool_result',
          callId: item.callId,
          outcome: 'completed',
          visibility,
          blocks: [{ id: `${id}-text`, kind: 'text', text: item.text, visibility }],
        },
      ],
    })
  }
  if (item.role === 'system' || item.role === 'user') {
    return judged({
      type: item.role,
      id,
      createdAt: at,
      blocks: [{ id: `${id}-text`, kind: 'text', text: item.text, visibility }],
    })
  }
  throw new Error(`unsupported manifest message role ${item.role}`)
}

export function cacheInput(manifest) {
  const definition = anthropicDefinitions.find(item => item.modelId === manifest.model)
  if (!definition || !['public', 'service'].includes(manifest.path))
    throw new Error('unknown Anthropic model or path')
  const configuration = { revision: 'cache-case-1', values: manifest.configuration }
  const profile = createOfficialProfileContent(definition, {
    providers: [manifest.provider],
    allowFallback: manifest.allowFallback,
    configuration,
  })
  if ('rejected' in profile) throw new Error(`profile: ${profile.rejected}`)
  const input = {
    target: {
      kind: 'model_call',
      callId: unwrap(parseOpaqueIdentifier('model-call-1', 'ModelCallId')),
      dispatch: 1,
    },
    routeName: manifest.model,
    provider: manifest.provider,
    parameters: manifest.parameters,
    tokenMargin: manifest.tokenMargin,
    calibration: { kind: 'none', reason: 'no_observation' },
    tools: manifest.tools,
    messages: manifest.messages.map(mapMessage),
    snapshot: {
      adaptation: profile.ok.adaptation,
      providers: profile.ok.providers,
      allowFallback: profile.ok.allowFallback,
      inputModalities: profile.ok.inputModalities,
      outputModalities: profile.ok.outputModalities,
      maxInputTokens: profile.ok.maxInputTokens,
      maxOutputTokens: profile.ok.maxOutputTokens,
      inputConstraints: profile.ok.inputConstraints,
      upstreamInputLimits: profile.ok.upstreamInputLimits,
      updatedAt: at,
    },
  }
  return { input, definition }
}
