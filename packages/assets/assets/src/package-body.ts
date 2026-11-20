import { writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { PackageManifest, PackageRejection } from './package.ts'
import { readBodyText } from './read-body.ts'

const BODY_LIMITS = Object.freeze({
  maxBytes: 1024 * 1024,
  maxDepth: 32,
  maxItems: 50_000,
  maxMembers: 1024,
  maxStringLength: 65_536,
  maxNumberLength: 32,
})

const text = (value: string): JsonValue => ({ kind: 'string', value })

function manifestTree(manifest: PackageManifest): JsonValue {
  const entries = manifest.entries.map((entry): JsonValue => ({
    kind: 'object',
    entries: [
      { key: 'path', value: text(entry.path) },
      { key: 'bytes', value: { kind: 'number', lexeme: String(entry.bytes) } },
      { key: 'digest', value: text(entry.digest) },
    ],
  }))
  return { kind: 'object', entries: [{ key: 'entries', value: { kind: 'array', items: entries } }] }
}

/** The body of a package, wherever it is kept: what its layout declared, with its manifest. */
export function packageBody(
  declaration: JsonValue,
  manifest: PackageManifest,
): Outcome<JsonValue, PackageRejection> {
  if (declaration.kind !== 'object' || declaration.entries.some(entry => entry.key === 'manifest'))
    return fail({ kind: 'invalid-package', reason: 'declaration-shape' })
  const body = readBodyText(
    writeJsonText({
      kind: 'object',
      entries: [...declaration.entries, { key: 'manifest', value: manifestTree(manifest) }],
    }),
    BODY_LIMITS,
  )
  return body.kind === 'ok'
    ? succeed(body.value)
    : fail({ kind: 'record-rejected', reason: 'limit_exceeded' })
}
