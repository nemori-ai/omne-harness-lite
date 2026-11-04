import type {
  FileIdentity,
  FileInformation,
  FacilityResult,
} from '@omne-harness/execution-environment-contract'
import type { FilesAuthorEnvironment } from '@omne-harness/tool-definitions'

export function filesFixture(initial: Record<string, string> = {}) {
  const encoder = new TextEncoder()
  const files = new Map(
    Object.entries(initial).map(([path, text]) => [
      path,
      { bytes: encoder.encode(text), version: '1' },
    ]),
  )
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
        // A directory named "exists" is there already, as `mkdir` with parents reports it.
        return path.endsWith('exists') ? rejected('conflict') : done(identity(path))
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
    config: {
      kind: 'object',
      entries: [{ key: 'resultMaxBytes', value: { kind: 'number', lexeme: '32768' } }],
    } as const,
    text: (path: string) =>
      new TextDecoder('utf-8', { ignoreBOM: true }).decode(files.get(path)?.bytes),
    set: (path: string, text: string) =>
      files.set(path, { bytes: encoder.encode(text), version: '1' }),
    unknownBatch: () => {
      batchUnknown = true
    },
  }
}
