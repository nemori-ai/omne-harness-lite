import { createHash } from 'node:crypto'
import type { PackageReader } from '@omne-harness/assets'
import { fail, succeed } from '@omne-harness/operation-result'

const digestOf = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

/** A package held in memory: a path to its text. */
export function packageOf(files: Readonly<Record<string, string>>): PackageReader {
  const bytes = new Map(
    Object.entries(files).map(([path, text]) => [path, new TextEncoder().encode(text)] as const),
  )
  return {
    async manifest() {
      return succeed({
        entries: [...bytes].map(([path, value]) => ({
          path,
          bytes: value.length,
          digest: digestOf(value),
        })),
      })
    },
    async open(path) {
      const found = bytes.get(path)
      return found === undefined ? fail('entry-not-found' as const) : succeed(found)
    },
  }
}

export const builtin = (extra: Record<string, unknown> = {}) => ({
  name: 'probe',
  position: 'before_action',
  power: 'veto',
  implementation: { kind: 'builtin', builtinName: 'probe' },
  ...extra,
})

export const command = (extra: Record<string, unknown> = {}) => ({
  name: 'probe',
  position: 'before_action',
  power: 'veto',
  implementation: { kind: 'command', interpreter: 'node', entry: 'check.mjs', timeout: 'PT10S' },
  ...extra,
})

export const text = (value: unknown) => JSON.stringify(value)
