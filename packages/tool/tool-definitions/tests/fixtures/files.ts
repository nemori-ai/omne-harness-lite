import type {
  FileIdentity,
  FileInformation,
  FacilityResult,
} from '@omne-harness/execution-environment-contract'
import type { JsonValue } from '@omne-harness/json-text'
import { succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  ToolMediaProduct,
  ToolMediaSink,
  ToolPrimitiveFailure,
} from '@omne-harness/tool-contract/provider'
import type { FilesAuthorEnvironment } from '@omne-harness/tool-definitions'

type Put = Parameters<ToolMediaSink['put']>[0]
/** A product as the store would answer it: the reference names the bytes it was given. */
export const productOf = (put: Put): ToolMediaProduct => ({
  ref: {
    storage: 'media',
    key: `stored-${put.bytes.byteLength}`,
    mediaType: put.mediaType,
    bytes: String(put.bytes.byteLength),
    digest: `sha256:${'d'.repeat(64)}`,
  },
  facts: { kind: 'image', widthPixels: 0, heightPixels: 0 },
})

export function filesFixture(initial: Record<string, string | Uint8Array> = {}) {
  const encoder = new TextEncoder()
  const files = new Map(
    Object.entries(initial).map(([path, content]) => [
      path,
      { bytes: typeof content === 'string' ? encoder.encode(content) : content, version: '1' },
    ]),
  )
  const puts: Put[] = []
  const stored = {
    answer: (put: Put): Outcome<ToolMediaProduct, ToolPrimitiveFailure> => succeed(productOf(put)),
  }
  const writes: { path: string; expectedVersion?: string }[] = []
  const mkdirs: { path: string; parents: boolean }[] = []
  const batches: unknown[] = []
  let batchUnknown = false
  const done = <T>(value: T): FacilityResult<T> => ({ kind: 'done', requestId: 'fixture', value })
  const rejected = (reason: 'notFound' | 'conflict' | 'unsupported' = 'unsupported') =>
    ({ kind: 'rejected', requestId: 'fixture', reason }) as const
  const identity = (path: string, version = '1'): FileIdentity => ({
    object: { token: `opaque:${path}` },
    handle: { object: { token: `opaque:${path}` }, generation: 'g' },
    version,
  })
  const information = (path: string): FileInformation => ({
    ...identity(path, files.get(path)?.version),
    type: 'file',
    sizeBytes: files.get(path)?.bytes.byteLength ?? 0,
    modifiedMs: 123,
  })
  const environment: FilesAuthorEnvironment = {
    media: {
      put: async put => {
        puts.push(put)
        return stored.answer(put)
      },
    },
    files: {
      read: async ({ path, offsetBytes = 0, limitBytes }) => {
        const file = files.get(path)
        if (!file) return rejected('notFound')
        const bytes = file.bytes.slice(
          offsetBytes,
          limitBytes === undefined ? undefined : offsetBytes + limitBytes,
        )
        return done({
          ...identity(path, file.version),
          bytes,
          nextOffsetBytes: offsetBytes + bytes.byteLength,
          eof: offsetBytes + bytes.byteLength >= file.bytes.byteLength,
        })
      },
      stat: async ({ path }) => (files.has(path) ? done(information(path)) : rejected('notFound')),
      write: async ({ path, bytes, expectedVersion, mode }) => {
        writes.push({ path, ...(expectedVersion === undefined ? {} : { expectedVersion }) })
        const previous = files.get(path)
        if (
          (mode === 'create' && previous) ||
          (expectedVersion !== undefined && previous?.version !== expectedVersion)
        )
          return rejected('conflict')
        const version = String(Number(previous?.version ?? '0') + 1)
        files.set(path, { bytes: bytes.slice(), version })
        return done(identity(path, version))
      },
      commitBatch: async ({ entries }) => {
        batches.push(entries)
        for (const entry of entries)
          if (files.get(entry.path)?.version !== entry.expectedVersion) return rejected('conflict')
        if (batchUnknown)
          return done({
            batch: { id: 'batch-original', generation: 'g' },
            kind: 'unknown',
            reason: 'effectUnknown',
            published: ['/a'],
          })
        for (const entry of entries)
          files.set(entry.path, {
            bytes: entry.bytes.slice(),
            version: String(Number(entry.expectedVersion) + 1),
          })
        return done({
          batch: { id: 'batch-original', generation: 'g' },
          kind: 'committed',
          published: entries.map(entry => entry.path),
        })
      },
      list: async () =>
        done({
          directory: identity('/'),
          entries: [...files.keys()].map(path => ({ ...information(path), name: path.slice(1) })),
          nextOffset: 7,
        }),
      search: async ({ match }) =>
        done({
          root: identity('/'),
          hits: [{ path: `/${match}-hit`, object: { token: 'not-a-name' } }],
          truncated: true,
          nextOffset: 2,
        }),
      mkdir: async ({ path, parents }) => {
        mkdirs.push({ path, parents: parents === true })
        if (path.endsWith('exists')) return rejected('conflict')
        return path.endsWith('refused') ? rejected('unsupported') : done(identity(path))
      },
      remove: async () => done({ removed: { token: 'removed' } }),
      move: async ({ path, target }) =>
        done({ source: { token: path }, target: identity(target.path) }),
      copy: async ({ path, target }) =>
        done({ source: { token: path }, target: identity(target.path) }),
      close: async ({ handle }) => done({ handle }),
      recoverBatch: async () => rejected(),
    },
  }
  return {
    environment,
    writes,
    mkdirs,
    batches,
    puts,
    stored,
    config: filesConstruction(),
    text: (path: string) =>
      new TextDecoder('utf-8', { ignoreBOM: true }).decode(files.get(path)?.bytes),
    set: (path: string, text: string) =>
      files.set(path, { bytes: encoder.encode(text), version: '1' }),
    unknownBatch: () => {
      batchUnknown = true
    },
  }
}

export const OPEN_LIMITS = {
  openMaxBytes: 65_536,
  imageMaxWidth: 64,
  imageMaxHeight: 64,
  imageMaxDecodedBytes: 64 * 64 * 4,
  imageConcurrency: 1,
}

export function filesConstruction(overrides: Readonly<Record<string, number>> = {}): JsonValue {
  const values = { resultMaxBytes: 32_768, ...OPEN_LIMITS, ...overrides }
  return {
    kind: 'object',
    entries: Object.entries(values).map(([key, value]) => ({
      key,
      value: { kind: 'number', lexeme: String(value) },
    })),
  }
}
