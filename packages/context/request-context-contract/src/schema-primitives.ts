import type { StandardSchemaV1 } from '@standard-schema/spec'
export type Path = readonly (string | number)[]
export type Decoded<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly Readonly<{ path: Path; message: string }>[] }>
export type Decoder<T> = (value: unknown, path: Path) => Decoded<T>
export function standardSchema<T>(decode: Decoder<T>): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'omne-request-context',
      validate(value) {
        const result = decode(value, [])
        return result.ok
          ? { value: result.value }
          : { issues: result.issues.map(i => ({ message: i.message, path: [...i.path] })) }
      },
    },
  }
}
export function record(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
export function decimal(v: unknown): v is string {
  return typeof v === 'string' && /^(0|[1-9][0-9]*)(\.[0-9]+)?$/u.test(v)
}
export function revision(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
}
export function integer(v: unknown): v is string {
  return typeof v === 'string' && /^(0|[1-9][0-9]*)$/u.test(v)
}
export function reject(path: Path): Decoded<never> {
  return { ok: false, issues: [{ path, message: 'Invalid request-context contract value' }] }
}
export function adoption(v: unknown): v is import('./refs.js').Adoption {
  return (
    record(v) &&
    typeof v.owner === 'string' &&
    typeof v.name === 'string' &&
    typeof v.revision === 'string' &&
    typeof v.digest === 'string'
  )
}
export function isEvidence(v: unknown): v is import('./refs.js').DurableEvidence {
  return record(v) && ['owner', 'record', 'revision', 'digest'].every(k => typeof v[k] === 'string')
}
export function isConsumed(
  v: unknown,
): v is Readonly<{ index: string; evidence: import('./refs.js').DurableEvidence }> {
  return record(v) && integer(v.index) && isEvidence(v.evidence)
}
