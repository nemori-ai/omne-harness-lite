import assert from 'node:assert/strict'
import { tenantCodec } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import {
  decodeToolCallId,
  decodeToolOperationId,
  type ToolState,
} from '@omne-harness/tool-contract'
import {
  decodeToolResultVersion,
  decodeToolRevision,
  type ToolBackgroundCallSource,
  type ToolBackgroundCallsSource,
} from '@omne-harness/tool-contract/provider'
import { evidence } from './tool-values.ts'

export function scope(ref: string) {
  const value = decodeScopeRef({ ref })
  assert.ok('ok' in value)
  return value.ok
}
export function tenant(account = 'a') {
  const value = tenantCodec.parse(
    JSON.stringify({
      organization: `org_${'0'.repeat(26)}`,
      account: `acc_${account.repeat(26)}`,
    }),
  )
  assert.ok(value.ok)
  return value.value
}
export function callId(value = 'call-1') {
  const decoded = decodeToolCallId(value)
  assert.ok('ok' in decoded)
  return decoded.ok
}
export function operation(value = 'admission-1') {
  const decoded = decodeToolOperationId(value)
  assert.ok('ok' in decoded)
  return decoded.ok
}
export function revision(value = 'revision-1') {
  const decoded = decodeToolRevision(value)
  assert.ok('ok' in decoded)
  return decoded.ok
}
export function result(value = 'result-1') {
  const decoded = decodeToolResultVersion(value)
  assert.ok('ok' in decoded)
  return decoded.ok
}
export const input = { tenant: tenant(), scope: scope('original-scope'), principal: 'reader' }
export function state(): ToolState {
  return {
    call: callId(),
    revision: revision(),
    source: evidence('state'),
    phase: 'accepted',
    relation: 'background',
    wait: { kind: 'none' },
    foreground: { kind: 'background', call: callId(), source: { kind: 'launched' } },
    execution: { kind: 'not-started' },
    effect: { kind: 'not-started' },
    timing: { kind: 'paused', accumulatedMs: '0' },
    queue: { kind: 'none' },
    controls: [],
    delivery: null,
    supplements: [],
  }
}
export function settled(): ToolState {
  return {
    ...state(),
    phase: 'settled',
    relation: 'background',
    wait: { kind: 'none' },
    terminal: { kind: 'completed' },
    result: result(),
    execution: { kind: 'ended', evidence: evidence('execution-ended') },
  }
}
export function original(
  overrides: Partial<ToolBackgroundCallSource> = {},
): ToolBackgroundCallSource {
  return {
    tenant: input.tenant,
    requesterScope: input.scope,
    admission: operation(),
    state: state(),
    tasks: [],
    description: {
      kind: 'value',
      value: { activity: 'Build the selected project.', waiting: null },
    },
    ...overrides,
  }
}
export function complete(
  calls: readonly ToolBackgroundCallSource[] = [original()],
): ToolBackgroundCallsSource {
  return { kind: 'value', value: { tenant: input.tenant, scope: input.scope, calls } }
}
