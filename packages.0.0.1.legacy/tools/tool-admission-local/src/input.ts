import {
  copyJsonValue,
  judgeContentBlock,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import { validate } from '@omne-harness-lite/loop-extension'
import type { AdmissionInput, SessionRunMode } from '@omne-harness-lite/tool-admission'
const fields = new Set([
  'call',
  'definition',
  'grants',
  'runMode',
  'effectivePermission',
  'tenantAutoWritable',
  'parent',
  'answer',
])
const required = ['call', 'definition', 'grants', 'runMode', 'effectivePermission']
const tiers = ['forbid', 'ask', 'auto'] as const
export const modes: readonly SessionRunMode[] = ['never', 'auto_permission', 'bypass-permissions']
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    object(value) &&
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key))
  )
}
/** Grants retain their opaque identity. All inspectable input is owned before any await. */
function capture(input: unknown): AdmissionInput | undefined {
  if (
    !object(input) ||
    Object.keys(input).some(key => !fields.has(key)) ||
    required.some(key => !Object.hasOwn(input, key))
  )
    return undefined
  const prototype: unknown = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (
    Reflect.ownKeys(input).length !== Object.keys(input).length ||
    Object.values(descriptors).some(
      descriptor => !('value' in descriptor) || !descriptor.enumerable,
    )
  )
    return undefined
  if (!object(input.grants)) return undefined
  const { grants, ...data } = input
  const copied = copyJsonValue(data)
  if ('failed' in copied || !object(copied.ok)) return undefined
  const value = copied.ok as JsonObject
  if (
    !object(value.call) ||
    value.call.kind !== 'tool_call' ||
    !Object.hasOwn(value.call, 'arguments') ||
    !('ok' in judgeContentBlock(value.call))
  )
    return undefined
  if (
    !validate('ToolDefinitionRef', value.definition).valid ||
    !object(value.definition) ||
    value.definition.name !== value.call.tool
  )
    return undefined
  if (value.effectivePermission === 'not_in_composition') {
    if (Object.hasOwn(value, 'tenantAutoWritable')) return undefined
  } else {
    const permission = value.effectivePermission
    if (
      !exact(permission, ['value', 'from']) ||
      !tiers.some(tier => tier === permission.value) ||
      typeof permission.from !== 'string' ||
      !['factory', 'organization', 'tenant', 'workspace'].includes(permission.from) ||
      (permission.from === 'workspace' && permission.value !== 'ask') ||
      typeof value.tenantAutoWritable !== 'boolean'
    )
      return undefined
  }
  const parent = value.parent
  if (
    Object.hasOwn(value, 'parent') &&
    (!exact(parent, ['permission', 'runMode']) || !tiers.some(tier => tier === parent.permission))
  )
    return undefined
  if (
    Object.hasOwn(value, 'answer') &&
    (typeof value.answer !== 'string' ||
      !['deny', 'allow_once', 'allow_session', 'allow_tenant', 'declined'].includes(value.answer))
  )
    return undefined
  return Object.freeze({ ...value, grants }) as unknown as AdmissionInput
}
export function captureBatch(
  input: unknown,
  checkParent = true,
):
  | { readonly batch: readonly [AdmissionInput, ...AdmissionInput[]] }
  | {
      readonly kind: 'failed'
      readonly reason: 'invalidInput' | 'modeUnknown' | 'parentNarrower'
    } {
  try {
    if (!Array.isArray(input) || input.length === 0)
      return { kind: 'failed', reason: 'invalidInput' }
    const descriptors = Object.getOwnPropertyDescriptors(input)
    if (
      Reflect.ownKeys(input).length !== input.length + 1 ||
      Array.from({ length: input.length }, (_, index) => descriptors[String(index)]).some(
        descriptor =>
          descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable,
      )
    )
      return { kind: 'failed', reason: 'invalidInput' }
    const batch = input.map(capture)
    if (batch.some(item => item === undefined)) return { kind: 'failed', reason: 'invalidInput' }
    const items = batch as [AdmissionInput, ...AdmissionInput[]],
      first = items[0]
    if (
      new Set(items.map(item => item.call.callId)).size !== items.length ||
      items.some(
        item =>
          item.runMode !== first.runMode ||
          Boolean(item.parent) !== Boolean(first.parent) ||
          item.parent?.runMode !== first.parent?.runMode,
      )
    )
      return { kind: 'failed', reason: 'invalidInput' }
    if (
      items.some(
        item =>
          !modes.includes(item.runMode) || (item.parent && !modes.includes(item.parent.runMode)),
      )
    )
      return { kind: 'failed', reason: 'modeUnknown' }
    if (
      checkParent &&
      items.some(
        item =>
          item.parent &&
          (modes.indexOf(item.runMode) > modes.indexOf(item.parent.runMode) ||
            (item.effectivePermission !== 'not_in_composition' &&
              tiers.indexOf(item.effectivePermission.value) >
                tiers.indexOf(item.parent.permission))),
      )
    )
      return { kind: 'failed', reason: 'parentNarrower' }
    return { batch: Object.freeze(items) }
  } catch {
    return { kind: 'failed', reason: 'invalidInput' }
  }
}
