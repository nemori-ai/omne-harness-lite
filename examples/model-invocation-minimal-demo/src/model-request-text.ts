import { modalityOf, type ContentBlock, type Modality } from '@omne-harness-lite/content-blocks'
import { judgeMessage, type LoggedMessage } from '@omne-harness-lite/messages'
import type {
  SettlementPrefix,
  SelectionProjection,
  SelectionCompatibility,
} from '@omne-harness-lite/model-request-runtime'
import {
  captureModelLogValue,
  decodeModelLogKey,
  inspectModelLogEntry,
} from '@omne-harness-lite/model-request-runtime'

/** Decode the complete log prefix without imposing a demo-specific message/block whitelist. */
export function messagePrefix(
  prefix: SettlementPrefix,
): { readonly messages: readonly LoggedMessage[] } | { readonly unavailable: true } {
  const messages: LoggedMessage[] = []
  for (const entry of prefix.entries) {
    if (entry.run !== undefined || entry.attempt !== undefined) return { unavailable: true }
    const keys = entry.readKeys.map(decodeModelLogKey)
    const message = keys.some(key => 'ok' in key && key.ok.kind === 'messages')
    const response = keys.some(key => 'ok' in key && key.ok.kind === 'response')
    const checked = inspectModelLogEntry({
      session: prefix.binding.session,
      tenant: prefix.binding.tenant,
      entry,
      purpose: { kind: message ? 'message' : response ? 'response' : 'record' },
      messagePrefix: messages,
    })
    // Assistant messages require persisted-response pairing: validate the complete value and its original response.
    if ('invalidValue' in checked && message) {
      const captured = captureModelLogValue({
        category: 'message',
        input: {
          kind: 'value',
          value:
            entry.payload !== null &&
            typeof entry.payload === 'object' &&
            !Array.isArray(entry.payload) &&
            'value' in entry.payload
              ? entry.payload.value
              : null,
        },
      })
      if ('invalidValue' in captured || captured.ok.message?.type !== 'assistant')
        return { unavailable: true }
      const assistant = captured.ok.message
      const original = prefix.entries.find(candidate =>
        candidate.readKeys.some(key => {
          const decoded = decodeModelLogKey(key)
          return (
            'ok' in decoded &&
            decoded.ok.kind === 'response' &&
            decoded.ok.response === assistant.response
          )
        }),
      )
      if (original === undefined) return { unavailable: true }
      const responseCapture = inspectModelLogEntry({
        session: prefix.binding.session,
        tenant: prefix.binding.tenant,
        entry: original,
        purpose: { kind: 'response' },
        messagePrefix: messages,
      })
      if ('invalidValue' in responseCapture) return { unavailable: true }
      const paired = inspectModelLogEntry({
        session: prefix.binding.session,
        tenant: prefix.binding.tenant,
        entry,
        purpose: { kind: 'persistedMessage', response: responseCapture.ok.captured },
        messagePrefix: messages,
      })
      if (
        'invalidValue' in paired ||
        paired.ok.captured.message === null ||
        paired.ok.captured.message.type === 'system'
      )
        return { unavailable: true }
      messages.push(paired.ok.captured.message)
    } else {
      if ('invalidValue' in checked) return { unavailable: true }
      const value = checked.ok.captured.message
      if (value !== null) {
        if (value.type === 'system' || !('ok' in judgeMessage(value))) return { unavailable: true }
        messages.push(value)
      }
    }
  }
  return { messages }
}
/** MP2 S-5 / CB3 S-6: project original model-visible blocks, without changing the messages. */
export async function historyProjection(prefix: SettlementPrefix): Promise<SelectionProjection> {
  const history = messagePrefix(prefix)
  if ('unavailable' in history) return { unknown: true }
  const modalities = new Set<Modality>()
  function visit(blocks: readonly ContentBlock[]): void {
    for (const block of blocks) {
      if (!block.visibility.toModel) continue
      if (block.kind === 'tool_result') {
        visit(block.blocks)
        continue
      }
      if ('transcript' in block) continue
      const modality =
        block.kind === 'file'
          ? modalityOf(block.attachment.mediaType)
          : block.kind === 'voice'
            ? 'audio'
            : block.kind === 'image'
              ? 'image'
              : 'text'
      if (modality !== undefined) modalities.add(modality)
    }
  }
  for (const message of history.messages) visit(message.blocks)
  return { known: [...modalities] }
}
/** MP2 S-7: compatibility belongs to the selected profile's declared inputs. */
export const nativeCompatibility: SelectionCompatibility = (profile, projection) => {
  const blocked = projection.filter(modality => !profile.inputModalities.includes(modality))
  return blocked.length ? { blocked } : { ok: true }
}
