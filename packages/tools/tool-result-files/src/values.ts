import { copyJsonValue, validate, type AttachmentRef } from '@omne-harness-lite/content-blocks'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { toolResultOf, type ToolResult } from '@omne-harness-lite/tool-definition'
import type { ExecutionRef, StoredToolResult } from '@omne-harness-lite/tool-execution-runtime'
import { object, same } from './records.ts'

export function captureScope(input: unknown): SessionScope | undefined {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !object(copy.ok) || Object.keys(copy.ok).length !== 2) return
  const tenant = parseTenantId(copy.ok.tenant),
    session = parseOpaqueIdentifier(copy.ok.session, 'SessionRef')
  if ('ok' in tenant && 'ok' in session) return { tenant: tenant.ok, session: session.ok }
}
export function captureRef(input: unknown): ExecutionRef | undefined {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !object(copy.ok) || Object.keys(copy.ok).length !== 3) return
  const scope = captureScope({ tenant: copy.ok.tenant, session: copy.ok.session }),
    call = parseOpaqueIdentifier(copy.ok.callId, 'CallId')
  if (scope && 'ok' in call) return { ...scope, callId: call.ok }
}
export function captureReference(input: unknown): AttachmentRef | undefined {
  const copy = copyJsonValue(input)
  if ('ok' in copy && validate('AttachmentRef', copy.ok).valid)
    return copy.ok as unknown as AttachmentRef
}
export function captureResult(input: unknown): StoredToolResult | undefined {
  const copy = copyJsonValue(input)
  if (
    'failed' in copy ||
    !object(copy.ok) ||
    Object.keys(copy.ok).some(key => !['ref', 'result', 'raw'].includes(key))
  )
    return
  const ref = captureRef(copy.ok.ref)
  if (!ref || !object(copy.ok.result)) return
  try {
    const result = toolResultOf(copy.ok.result, unwrap(parseOpaqueIdentifier('unused', 'BlockId'))),
      raw = copy.ok.raw === undefined ? undefined : captureReference(copy.ok.raw)
    if (copy.ok.raw !== undefined && raw === undefined) return
    if (result.offload && 'inline' in result.offload.raw) return
    return { ref, result, ...(raw ? { raw } : {}) }
  } catch {
    return
  }
}
/** Only protocol reference fields count. Arbitrary text/JSON cannot grant access to bytes. */
export function references(result: ToolResult): AttachmentRef[] {
  const output: AttachmentRef[] = [...(result.attachments ?? [])]
  if (result.offload && 'storage' in result.offload.raw) output.push(result.offload.raw)
  for (const block of [...result.content, ...(result.offload?.summary ?? [])]) {
    if (block.kind === 'file') output.push(block.attachment)
    if ((block.kind === 'image' || block.kind === 'voice') && 'storage' in block.data)
      output.push(block.data)
    if ('renderings' in block)
      for (const rendering of block.renderings ?? [])
        for (const child of rendering.blocks) {
          if ((child.kind === 'image' || child.kind === 'voice') && 'storage' in child.data)
            output.push(child.data)
        }
  }
  return output
}
export function originalMatches(result: StoredToolResult, returned: unknown): boolean {
  if (typeof returned !== 'string') return same(result.result, returned)
  const block = result.result.content[0]
  return block !== undefined && same(result.result, toolResultOf(returned, block.id))
}
