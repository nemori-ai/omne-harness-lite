import { judgeJsonValue, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolAvailability, ToolCommandReleaseDetail } from './definitions.ts'
import type { Access } from './identity.ts'

export type ReleaseRow = Readonly<{ label: string; value: string | readonly string[] }>

/** What the implementer's function gives back for one call. */
export type ReleaseDescription = Readonly<{ rows: readonly ReleaseRow[]; typed?: JsonValue }>

export type ToolReleaseDescriber<A> = (
  input: Readonly<{ principal: unknown; tenant: TenantId; arguments: A }>,
) => Promise<ReleaseDescription>

export type ReleaseDetail = Readonly<{
  rows: readonly ReleaseRow[]
  typed?: Readonly<{ kind: string; value: string }>
}>

export type ReleaseDetailAnswer =
  | (Readonly<{ kind: 'detail' }> & ReleaseDetail)
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'unavailable'; reason: string }>

export interface ToolReleaseDetails<P> {
  describe(
    input: Access<P> &
      Readonly<{
        availability: Extract<ToolAvailability, { kind: 'available' }>
        command: string | null
        effectiveArguments: string
      }>,
  ): Promise<ReleaseDetailAnswer>
}

export type ReleaseDetailPolicy = Readonly<{
  timeoutMs: number
  maxRows: number
  maxLabel: number
  maxText: number
  maxItems: number
  maxItem: number
  maxTypedBytes: number
}>

export const DEFAULT_RELEASE_DETAIL_POLICY: ReleaseDetailPolicy = Object.freeze({
  timeoutMs: 2000,
  maxRows: 24,
  maxLabel: 40,
  maxText: 500,
  maxItems: 12,
  maxItem: 200,
  maxTypedBytes: 16 * 1024,
})

const codePoints = (value: string) => [...value].length
const fits = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.isWellFormed() &&
  value.trim() !== '' &&
  codePoints(value) <= max

function rowOf(value: unknown, policy: ReleaseDetailPolicy): ReleaseRow | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { label, value: shown, ...rest } = value as Record<string, unknown>
  if (Object.keys(rest).length > 0 || !fits(label, policy.maxLabel)) return undefined
  if (typeof shown === 'string')
    return fits(shown, policy.maxText) ? { label, value: shown } : undefined
  if (!Array.isArray(shown) || shown.length === 0 || shown.length > policy.maxItems)
    return undefined
  return shown.every(entry => fits(entry, policy.maxItem))
    ? { label, value: Object.freeze([...shown] as string[]) }
    : undefined
}

/** Checks a description against the declaration of its command and the budget, shape and size only. */
export function judgeReleaseDescription(
  value: unknown,
  declared: ToolCommandReleaseDetail | undefined,
  policy: ReleaseDetailPolicy,
): Outcome<ReleaseDetail, string> {
  if (typeof value !== 'object' || value === null) return fail('not-an-object')
  const { rows, typed, ...rest } = value as Record<string, unknown>
  if (Object.keys(rest).length > 0) return fail('unknown-field')
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > policy.maxRows) return fail('rows')
  const read = rows.map(row => rowOf(row, policy))
  if (read.some(row => row === undefined)) return fail('row')
  if ((typed === undefined) !== (declared === undefined)) return fail('typed-undeclared')
  if (typed === undefined || declared === undefined)
    return succeed({ rows: Object.freeze(read as ReleaseRow[]) })
  const tree = judgeJsonValue(typed)
  if (!('ok' in tree)) return fail('typed-not-json')
  const text = writeJsonText(tree.ok)
  if (new TextEncoder().encode(text).byteLength > policy.maxTypedBytes)
    return fail('typed-too-large')
  return succeed({
    rows: Object.freeze(read as ReleaseRow[]),
    typed: { kind: declared.kind, value: text },
  })
}
