import type { JsonValue as AssemblyJsonValue } from '@omne-harness-lite/cordis-plugin-tree'
import { validate, type AttachmentRef, type JsonValue } from '@omne-harness-lite/content-blocks'
import { capabilityCanonicalString } from '@omne-harness-lite/asset-model'
import type { ToolDefinition } from '@omne-harness-lite/tool-definition'
import type { ToolExecutor, SelectedTool } from '@omne-harness-lite/tool-execution-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { parseTenantId, parseOpaqueIdentifier, isOk } from '@omne-harness-lite/identity-values'

export const resultReaderDefinition: ToolDefinition = {
  name: 'demo:read_result',
  paradigm: 'single',
  origin: { kind: 'authored' },
  description:
    'Read a durably published text attachment from this session. Supply its exact storage and key. Image attachments are not text.',
  input: {
    type: 'object',
    properties: {
      storage: {
        type: 'string',
        description: 'The storage from the published attachment reference.',
      },
      key: { type: 'string', description: 'The key from the published attachment reference.' },
      mediaType: {
        type: 'string',
        description: 'The media type from the published attachment reference.',
      },
      bytes: {
        type: 'integer',
        description: 'The byte count from the published attachment reference.',
      },
      name: { type: 'string', description: 'The name from the published attachment reference.' },
    },
    required: ['storage', 'key', 'mediaType'],
    additionalProperties: false,
  },
  permissions: { execute: { default: 'auto' } },
}
export const resultReaderSelection: SelectedTool = {
  capability: capabilityCanonicalString({ category: 'tool', name: resultReaderDefinition.name }),
  asset: 'demo-result-reader-asset',
  version: '1',
  adoption: 'demo-result-reader',
  definition: resultReaderDefinition,
}
export const resultReaderConfig: AssemblyJsonValue = JSON.parse(
  JSON.stringify(resultReaderSelection),
)
export type DemoAttachmentRead = (
  scope: SessionScope,
  reference: AttachmentRef,
) => Promise<Uint8Array | undefined>
export function resultReaderExecutor(read: DemoAttachmentRead): ToolExecutor {
  return async (parameters, deps) => {
    if (!validate('AttachmentRef', parameters).valid)
      throw new TypeError('Invalid attachment reference')
    const values = await deps.context.read(['session'])
    if (values.kind !== 'values') throw new Error('Session context unavailable')
    const identity = values.values[0]?.value as { tenant?: JsonValue; session?: string } | undefined
    const tenant = parseTenantId(identity?.tenant),
      session = parseOpaqueIdentifier(identity?.session, 'SessionRef')
    if (!isOk(tenant) || !isOk(session)) throw new Error('Session identity unavailable')
    const bytes = await read(
      { tenant: tenant.ok, session: session.ok },
      parameters as unknown as AttachmentRef,
    )
    if (!bytes) throw new Error('Attachment read unavailable')
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  }
}
