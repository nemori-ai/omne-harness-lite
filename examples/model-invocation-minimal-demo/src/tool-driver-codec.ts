import { checkLogPayload, factLogPayload } from '@omne-harness-lite/session-log'
import { createRequire } from 'node:module'
import { ExactDecimal, judgeAccountValue } from '@omne-harness-lite/call-accounts'
import {
  copyJsonValue,
  judgeContentBlock,
  readJsonStrict,
  validate as validateContent,
  type JsonValue,
  type ToolCallBlock,
} from '@omne-harness-lite/content-blocks'
import {
  parseOpaqueIdentifier,
  parseTenantId,
  tenantIdEquals,
} from '@omne-harness-lite/identity-values'
import { readReport } from '@omne-harness-lite/asset-registry'
import { judgeDefinition } from '@omne-harness-lite/loop-extension'
import { judgeMessage } from '@omne-harness-lite/messages'
import { modelLogJsonEqual } from '@omne-harness-lite/model-request-runtime'
import { instantFromRfc3339 } from '@omne-harness-lite/offer-expiry'
import {
  checkAppendInput,
  compareInteger,
  positiveInteger,
  type LogEntry,
  type OwnedLogEntry,
} from '@omne-harness-lite/session-log'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'
import { judgeToolDefinition, modelName } from '@omne-harness-lite/tool-definition'
import type { DriverPayload, DriverValue } from './tool-driver-types.ts'

export const toolDriverFormat = 'tool-driver/1'
export const toolDriverAll = `${toolDriverFormat}/all`
const require = createRequire(new URL('../package.json', import.meta.url))
const invalid = Object.freeze({ invalid: true } as const)
const unrelated = Object.freeze({ unrelated: true } as const)

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function identity(value: unknown): value is string {
  return 'ok' in parseOpaqueIdentifier(value, 'ToolDriverIdentity')
}
function instant(value: string): boolean {
  return 'ok' in instantFromRfc3339(value.replace(/\.[0-9]+(?=Z|[+-])/u, ''))
}
function call(value: unknown): value is ToolCallBlock {
  const judged = judgeContentBlock(value)
  return 'ok' in judged && judged.ok.kind === 'tool_call'
}
function denial(value: unknown): boolean {
  return validateContent('ActionDenialReason', value).valid
}
function captureScope(input: SessionScope): SessionScope | undefined {
  const copied = copyJsonValue(input)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    Array.isArray(copied.ok) ||
    !('tenant' in copied.ok) ||
    !('session' in copied.ok) ||
    Object.keys(copied.ok).length !== 2
  )
    return undefined
  const tenant = parseTenantId(copied.ok.tenant)
  const session = parseOpaqueIdentifier(copied.ok.session, 'SessionRef')
  return 'ok' in tenant && 'ok' in session ? { tenant: tenant.ok, session: session.ok } : undefined
}

/** The graph checks local closed shapes. Each foreign value retains its owner's judge. */
function fixedShape(name: 'Value' | 'Payload', value: JsonValue): boolean {
  const validators = require('./generated/tool-driver.cjs') as Record<
    'Value' | 'Payload',
    (value: unknown) => boolean
  >
  return validators[name](value)
}

function adoptionValid(value: Extract<DriverValue, { kind: 'attempt_adopted' }>): boolean {
  if (
    value.report === null ||
    typeof value.report !== 'object' ||
    typeof value.report.session !== 'string'
  )
    return false
  const report = readReport(value.report, value.report.session)
  if (
    report === undefined ||
    report.runId !== value.run ||
    compareInteger(report.attempt, value.attempt) !== 0 ||
    new Set(value.tools.map(tool => tool.name)).size !== value.tools.length ||
    new Set(value.context.map(item => item.key)).size !== value.context.length
  )
    return false
  const permissions = Object.keys(report.effectivePermissions)
  if (
    permissions.length !== value.tools.length ||
    value.tools.some(tool => !permissions.includes(tool.name))
  )
    return false
  return (
    value.tools.every(tool => {
      const version = readJsonStrict(tool.version)
      return (
        identity(tool.capability) &&
        identity(tool.asset) &&
        !('failed' in version) &&
        positiveInteger(version.ok) &&
        'ok' in judgeToolDefinition(tool.definition) &&
        modelName(tool.definition.name) === tool.name
      )
    }) &&
    value.context.every(
      item => identity(item.key) && identity(item.revision) && instant(item.observedAt),
    )
  )
}

function completionValid(value: Extract<DriverValue, { kind: 'actions_completed' }>): boolean {
  const items = value.completion.items
  if (
    new Set(items.map(item => item.callId)).size !== items.length ||
    !identity(value.completion.key) ||
    !value.chain.every(piece => 'ok' in judgeDefinition(piece.definition)) ||
    new Set(value.chain.map(piece => piece.definition.name)).size !== value.chain.length
  )
    return false
  return items.every(item => {
    if (
      !call(item.effectiveCall) ||
      item.effectiveCall.callId !== item.callId ||
      (item.anchor !== undefined && !identity(item.anchor)) ||
      !item.conclusions.every(identity) ||
      new Set(item.conclusions).size !== item.conclusions.length
    )
      return false
    const decision = item.decision
    if (decision.kind === 'denied')
      return (
        denial(decision.reason) &&
        identity(decision.conclusion) &&
        decision.reason.conclusion === decision.conclusion
      )
    return decision.conclusion === undefined || identity(decision.conclusion)
  })
}

function valueValid(value: DriverValue): boolean {
  if ('origin' in value) {
    if (
      !identity(value.origin.run) ||
      !positiveInteger(value.origin.attempt) ||
      !identity(value.origin.assistantMessage)
    )
      return false
  } else if (!('ok' in judgeAccountValue('RunId', value.run))) return false
  switch (value.kind) {
    case 'run_started':
      return identity(value.inboundKey) && instant(value.at)
    case 'run_ended':
      return (
        value.basis.every(identity) &&
        new Set(value.basis).size === value.basis.length &&
        instant(value.at)
      )
    case 'attempt_adopted':
      return (
        positiveInteger(value.attempt) &&
        identity(value.adoption) &&
        identity(value.startedFactKey) &&
        adoptionValid(value)
      )
    case 'actions_completed':
      return identity(value.adoption) && completionValid(value)
    case 'continuation_requested':
      return (
        identity(value.requestKey) &&
        identity(value.batch.pass) &&
        value.batch.chain.every(
          piece =>
            'ok' in judgeDefinition(piece.definition) &&
            piece.definition.position === 'after_action' &&
            piece.definition.dimension.scope === 'batch',
        ) &&
        new Set(value.batch.chain.map(piece => piece.definition.name)).size ===
          value.batch.chain.length &&
        value.batch.conclusions.every(identity) &&
        new Set(value.batch.conclusions).size === value.batch.conclusions.length
      )
    case 'action_denial_intended':
      return identity(value.adoption) && call(value.call) && denial(value.reason)
    case 'action_denied': {
      const judged = judgeMessage(value.message)
      if (
        !identity(value.callId) ||
        !denial(value.reason) ||
        !('ok' in judged) ||
        judged.ok.type !== 'tool'
      )
        return false
      const result = judged.ok.blocks[0]
      return (
        judged.ok.callId === value.callId &&
        result.outcome === 'denied' &&
        modelLogJsonEqual(result.reason, value.reason)
      )
    }
  }
}

/** Captures JSON before schema or owner code can observe it; getters are never executed. */
export function captureDriverValue(input: unknown): DriverValue | typeof invalid {
  const copy = copyJsonValue(input)
  if ('failed' in copy || !fixedShape('Value', copy.ok)) return invalid
  // This cast follows the closed graph; foreign nested values are judged immediately below.
  const value = copy.ok as unknown as DriverValue
  return valueValid(value) ? value : invalid
}

/** Only captured values enter this internal spelling function. */
function keyOf(value: DriverValue): string {
  let parts: readonly string[]
  switch (value.kind) {
    case 'run_started':
      parts = ['run', value.run]
      break
    case 'attempt_adopted':
      parts = ['attempt', value.run, ExactDecimal.from(value.attempt).toCanonicalString()]
      break
    case 'actions_completed':
      parts = ['actions', value.origin.assistantMessage]
      break
    case 'continuation_requested':
      parts = ['continuation', value.origin.assistantMessage]
      break
    case 'action_denial_intended':
      parts = ['denial-intended', value.call.callId]
      break
    case 'action_denied':
      parts = ['denied', value.callId]
      break
    case 'run_ended':
      parts = ['end', value.run]
      break
  }
  return `${toolDriverFormat}/${JSON.stringify(parts)}`
}

export function driverKey(input: unknown): string | typeof invalid {
  const value = captureDriverValue(input)
  return 'invalid' in value ? value : keyOf(value)
}

function localRelations(value: DriverValue, scope: SessionScope, key: string): boolean {
  if (value.kind === 'attempt_adopted')
    return value.adoption === key && value.report.session === scope.session
  if (value.kind === 'actions_completed') return value.completion.key === key
  return true
}

export function prepareDriverEntry(
  suppliedScope: SessionScope,
  input: unknown,
): { readonly entry: OwnedLogEntry } | typeof invalid {
  const scope = captureScope(suppliedScope)
  if (scope === undefined) return invalid
  const value = captureDriverValue(input)
  if ('invalid' in value) return value
  const key = keyOf(value)
  const exec =
    'origin' in value ? value.origin : value.kind === 'attempt_adopted' ? value : undefined
  const payload: DriverPayload = { format: toolDriverFormat, category: 'driver', value }
  const result = checkAppendInput(
    scope.session,
    [
      {
        tenant: scope.tenant,
        ...(exec === undefined ? {} : { run: exec.run, attempt: exec.attempt }),
        dedupeKey: key,
        readKeys: [key, toolDriverAll],
        payload: factLogPayload('demo-tool-driver', '1', payload),
      },
    ],
    exec === undefined
      ? { kind: 'unfenced' }
      : { kind: 'fenced', run: exec.run, attempt: exec.attempt },
    { kind: 'unconditional' },
  )
  if ('failure' in result || !localRelations(value, scope, key)) return invalid
  const entry = result.ok.entries[0]
  if (entry === undefined) throw new Error('validated driver entry disappeared')
  return { entry }
}

function claimsKey(value: unknown): boolean {
  return typeof value === 'string' && (value === 'tool-driver' || value.startsWith('tool-driver/'))
}

/** Unknown versions or conflicting shell/keys fail closed instead of becoming foreign entries. */
export function inspectDriverEntry(
  suppliedScope: SessionScope,
  input: LogEntry,
):
  | { readonly value: DriverValue; readonly key: string; readonly entry: LogEntry }
  | typeof invalid
  | typeof unrelated {
  const scope = captureScope(suppliedScope)
  if (scope === undefined) return invalid
  const copied = copyJsonValue(input)
  if (
    'failed' in copied ||
    copied.ok === null ||
    typeof copied.ok !== 'object' ||
    Array.isArray(copied.ok)
  )
    return invalid
  // The common shell is checked below through the log owner's input boundary.
  const shell = copied.ok as unknown as LogEntry
  const payload = ownedDriverPayload(shell.payload)
  const claimed =
    claimsKey(shell.dedupeKey) ||
    (Array.isArray(shell.readKeys) && shell.readKeys.some(claimsKey)) ||
    (object(shell.payload) && shell.payload.owner === 'demo-tool-driver')
  if (!claimed) return unrelated
  if (
    shell.session !== scope.session ||
    !positiveInteger(shell.position) ||
    !('ok' in parseTenantId(shell.tenant)) ||
    !tenantIdEquals(shell.tenant, scope.tenant) ||
    !fixedShape('Payload', payload) ||
    Object.keys(shell).some(
      key =>
        ![
          'session',
          'position',
          'tenant',
          'run',
          'attempt',
          'dedupeKey',
          'readKeys',
          'payload',
        ].includes(key),
    )
  )
    return invalid
  const value = captureDriverValue((payload as unknown as DriverPayload).value)
  if ('invalid' in value) return invalid
  const expected = prepareDriverEntry(scope, value)
  if ('invalid' in expected) return invalid
  const key = expected.entry.dedupeKey
  if (key === undefined) throw new Error('prepared driver entry lacks its key')
  if (
    shell.dedupeKey !== key ||
    !Array.isArray(shell.readKeys) ||
    shell.readKeys.length !== 2 ||
    !shell.readKeys.includes(key) ||
    !shell.readKeys.includes(toolDriverAll) ||
    shell.run !== expected.entry.run ||
    (shell.attempt === undefined) !== (expected.entry.attempt === undefined) ||
    (shell.attempt !== undefined &&
      (!positiveInteger(shell.attempt) ||
        expected.entry.attempt === undefined ||
        compareInteger(shell.attempt, expected.entry.attempt) !== 0))
  )
    return invalid
  return { value, key, entry: shell }
}

function ownedDriverPayload(
  value: unknown,
): import('@omne-harness-lite/content-blocks').JsonValue | null {
  const outer = checkLogPayload(value)
  if (!('kind' in outer) || outer.kind !== 'fact') return null
  return outer.payload.owner === 'demo-tool-driver' && outer.payload.version === '1'
    ? outer.payload.value
    : null
}
