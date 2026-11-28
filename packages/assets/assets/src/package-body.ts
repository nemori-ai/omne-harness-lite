import { readJsonBytes, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { PackageManifest, PackageReader, PackageRejection } from './package.ts'
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

const INDEX = /^(?:0|[1-9][0-9]*)$/u

/** The value a JSON Pointer (RFC 6901) names in a tree; undefined when a step names nothing. */
function pointed(root: JsonValue, pointer: string): JsonValue | undefined {
  if (pointer === '') return root
  if (!pointer.startsWith('/')) return undefined
  let at: JsonValue | undefined = root
  for (const raw of pointer.slice(1).split('/')) {
    const step = raw.replaceAll('~1', '/').replaceAll('~0', '~')
    if (at?.kind === 'object') at = at.entries.find(entry => entry.key === step)?.value
    else if (at?.kind === 'array' && INDEX.test(step)) at = at.items[Number(step)]
    else return undefined
  }
  return at
}

/** The body a held item's `valueAt` names: `<path>#<JSON Pointer>` into a JSON file of the package. Undefined when it cannot be read. */
export async function packageValue(
  from: PackageReader,
  valueAt: string,
): Promise<JsonValue | undefined> {
  const hash = valueAt.indexOf('#')
  if (hash < 0) return undefined
  const path = valueAt.slice(0, hash)
  const listed = await from.manifest()
  const entry = 'ok' in listed ? listed.ok.entries.find(each => each.path === path) : undefined
  if (entry === undefined) return undefined
  const opened = await from.open(path, entry.digest)
  if (!('ok' in opened)) return undefined
  const read = readJsonBytes(opened.ok, BODY_LIMITS)
  const found = read.kind === 'ok' ? pointed(read.value, valueAt.slice(hash + 1)) : undefined
  if (found === undefined) return undefined
  const body = readBodyText(writeJsonText(found), BODY_LIMITS)
  return body.kind === 'ok' ? body.value : undefined
}
