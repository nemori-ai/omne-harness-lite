import { createRequire } from 'node:module'
import type { ActionIntent, PromptResult } from '@omne-harness-lite/governance-client-operations'
import { InputFailure } from '../diagnostic.ts'
import { readInputFile } from '../input.ts'
import { validIntent } from '../validation.ts'

export type Tenant = { readonly account: string; readonly organization: string }
export interface Field {
  readonly name: string
  readonly label: string
  readonly kind:
    | 'text'
    | 'secret-file'
    | 'current-tenant'
    | 'tenant'
    | 'organizations'
    | 'integer'
    | 'boolean'
    | 'enum'
  readonly required: boolean
  readonly options?: readonly string[]
  readonly when?: { readonly field: string; readonly equals: string }
}
export interface Form {
  readonly id: string
  readonly label: string
  readonly action: 'register' | 'login' | 'configure' | 'health' | 'logout' | 'invoke'
  readonly operation: string | null
  readonly phase: 'setup' | 'governance'
  readonly fields: readonly Field[]
  readonly payloadSchema?: string
}
const require = createRequire(import.meta.url)
const builtRequire = createRequire(new URL('../../package.json', import.meta.url))
const { Forms: check } = builtRequire('./generated/forms.cjs') as {
  Forms(value: unknown): value is readonly Form[]
}
const metadata: unknown = require('../../forms/forms.json')
if (!check(metadata)) throw new Error('invalid bundled forms')
export const forms = metadata
export const FIELD_LIMIT = 64 * 1024

/** Pure field policy, before Input/layout; no trim, replacement or silent clipping. */
export function validFieldText(value: string): boolean {
  return (
    Buffer.byteLength(value, 'utf8') <= FIELD_LIMIT &&
    value.isWellFormed() &&
    !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)
  )
}
function invalidField(): never {
  throw new InputFailure('invalid-options')
}
function tenantValue(value: unknown): Tenant {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalidField()
  const keys = Object.keys(value)
  if (
    keys.length !== 2 ||
    !('account' in value) ||
    !('organization' in value) ||
    typeof value.account !== 'string' ||
    typeof value.organization !== 'string' ||
    !validFieldText(value.account) ||
    !validFieldText(value.organization)
  )
    return invalidField()
  return { account: value.account, organization: value.organization }
}
function organizationValues(value: unknown): unknown[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 2 ||
    !value.every((x: unknown) => typeof x === 'string' && validFieldText(x))
  )
    return invalidField()
  return [...value]
}
export function fieldValue(field: Field, value: unknown): unknown {
  if (field.kind === 'boolean') return typeof value === 'boolean' ? value : invalidField()
  if (field.kind === 'tenant' || field.kind === 'current-tenant') return tenantValue(value)
  if (field.kind === 'organizations') return organizationValues(value)
  return textFieldValue(field, value)
}
function textFieldValue(field: Field, value: unknown): string | number {
  if (typeof value !== 'string' || !validFieldText(value)) return invalidField()
  if (field.kind === 'integer') {
    if (!/^-?(?:0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)))
      return invalidField()
    return Number(value)
  }
  if (field.kind === 'enum' && !field.options?.includes(value)) return invalidField()
  return value
}
export interface PreparedForm {
  readonly intent: ActionIntent
  readonly secretPaths: Readonly<Record<string, string>>
}
function validateDraftNames(form: Form, draft: Readonly<Record<string, unknown>>): void {
  for (const name of Object.keys(draft))
    if (!form.fields.some(f => f.name === name && f.kind !== 'current-tenant'))
      throw new InputFailure('invalid-options')
}
function parseDraft(
  form: Form,
  draft: Readonly<Record<string, unknown>>,
  tenant: Tenant | undefined,
) {
  const payload: Record<string, unknown> = {},
    secretPaths: Record<string, string> = {}
  validateDraftNames(form, draft)
  for (const field of form.fields) {
    if (field.when && draft[field.when.field] !== field.when.equals) {
      if (Object.hasOwn(draft, field.name)) throw new InputFailure('invalid-options')
      continue
    }
    const value = field.kind === 'current-tenant' ? tenant : draft[field.name]
    if (value === undefined) {
      if (field.required) throw new InputFailure('invalid-options')
      continue
    }
    const parsed = fieldValue(field, value)
    if (field.kind === 'secret-file') {
      if (typeof parsed !== 'string' || parsed.length === 0) throw new InputFailure('secret-source')
      secretPaths[field.name] = parsed
    } else payload[field.name] = parsed
  }
  return { payload, secretPaths }
}
/** A draft contains only non-secret values and paths. Secrets are read in the CG callback. */
export async function prepareForm(
  form: Form,
  draft: Readonly<Record<string, unknown>>,
  tenant: Tenant | undefined,
  refresh: boolean,
  signal: AbortSignal,
): Promise<PreparedForm> {
  const { payload, secretPaths } = parseDraft(form, draft, tenant)
  let intent: unknown
  if (form.action === 'configure') {
    const trust =
      payload['trustMode'] === 'system-ca'
        ? { mode: 'ca' }
        : payload['trustMode'] === 'spki'
          ? { mode: 'spki', sha256: payload['spki'] }
          : {
              mode: 'ca',
              certificateAuthorities: await readInputFile(
                typeof payload['caFile'] === 'string' ? payload['caFile'] : '',
                1024 * 1024,
                false,
                signal,
              ),
            }
    intent = { action: form.action, endpoint: payload['endpoint'], trust }
  } else if (form.action === 'health' || form.action === 'logout') intent = { action: form.action }
  else
    intent = {
      action: form.action,
      payload,
      ...(form.action === 'invoke'
        ? { operation: form.operation, ...(refresh ? { readMode: 'refresh' } : {}) }
        : {}),
    }
  if (!validIntent(intent)) throw new InputFailure('invalid-options')
  return { intent, secretPaths }
}
export async function formSecrets(
  paths: Readonly<Record<string, string>>,
  signal: AbortSignal,
): Promise<PromptResult> {
  const keys = Object.keys(paths)
  if (keys.length === 0) return { kind: 'continue', secrets: {} }
  if (keys.length === 1 && typeof paths['credential'] === 'string')
    return {
      kind: 'continue',
      secrets: { credential: await readInputFile(paths['credential'], FIELD_LIMIT, true, signal) },
    }
  if (
    keys.length === 2 &&
    typeof paths['currentCredential'] === 'string' &&
    typeof paths['newCredential'] === 'string'
  )
    return {
      kind: 'continue',
      secrets: {
        currentCredential: await readInputFile(
          paths['currentCredential'],
          FIELD_LIMIT,
          true,
          signal,
        ),
        newCredential: await readInputFile(paths['newCredential'], FIELD_LIMIT, true, signal),
      },
    }
  throw new Error('invalid secret slots')
}
