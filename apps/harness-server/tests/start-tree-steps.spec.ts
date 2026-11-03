// startTree: the order of its steps and what each early exit leaves behind. Preflight comes first,
// then the preparation, then the entry objects, then the rows. A step that fails stops the later ones.
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import { disposeTree, startTree, type EntryObject, type StartResult } from '../src/loader.ts'
import { createStubPlugin, type StubEvent } from '../src/s0/stub-plugin.ts'
import { createTrust } from '../src/trust.ts'
import type { RowId, RowManifest, ServiceName, TreeRow } from '../src/types.ts'

const live: Array<{ root: Context; result: StartResult }> = []
afterEach(async () => {
  while (live.length > 0) {
    const finished = live.pop()!
    if (finished.result.kind === 'started') await disposeTree(finished.root, finished.result.rows)
  }
})

function rowSpec(id: string, events: StubEvent[]) {
  const manifest: RowManifest = { provides: [], injects: [], phase: null, sameProviderGroup: null }
  const row: TreeRow = { id: id as RowId, plugin: 'stub', config: {}, source: 'distribution' }
  return {
    row,
    manifest,
    plugin: createStubPlugin({
      id: row.id,
      manifest,
      hooks: { observe: event => events.push(event) },
    }),
  }
}

function start(
  rowIds: readonly string[],
  extra: Partial<Parameters<typeof startTree>[0]> & { steps?: string[] } = {},
) {
  const events: StubEvent[] = []
  const root = new Context()
  const { steps, ...options } = extra
  const entryObjects = options.entryObjects ?? []
  const pending = startTree({
    root,
    trust: createTrust([], new Map()),
    rows: rowIds.map(id => rowSpec(id, events)),
    entryObjects,
    readinessTimeoutMs: 500,
    barrier: () => void steps?.push('barrier'),
    ...options,
  }).then(result => {
    live.push({ root, result })
    return result
  })
  return { pending, events, root }
}
const named = (name: string): ServiceName => name as ServiceName
const installing = (name: string, steps: string[], fail = false): EntryObject => ({
  name: named(name),
  install: () => {
    steps.push(`install:${name}`)
    if (fail) throw new Error(`install ${name} broke`)
  },
})

describe('startTree steps', () => {
  it('prepares after the preflight and before any entry object or row', async () => {
    const steps: string[] = []
    const { pending, events } = start(['a'], {
      steps,
      entryObjects: [installing('s0.one', steps)],
      prepare: () => void steps.push('prepare'),
    })
    const result = await pending
    expect(result.kind).toBe('started')
    expect(steps).toEqual(['prepare', 'install:s0.one', 'barrier'])
    expect(events).toEqual([{ kind: 'applied', row: 'a' }])
  })

  it('does not prepare when the preflight rejects the tree', async () => {
    const steps: string[] = []
    const { pending, events } = start(['a', 'a'], {
      steps,
      entryObjects: [installing('s0.one', steps)],
      prepare: () => void steps.push('prepare'),
    })
    const result = await pending
    expect(result).toMatchObject({ kind: 'rejected', exitCode: 2 })
    expect(steps).toEqual([])
    expect(events).toEqual([])
  })

  it('stops with preparation-failed and its error, before any entry object or row', async () => {
    const steps: string[] = []
    const error = new Error('prepare broke')
    const { pending, events } = start(['a'], {
      steps,
      entryObjects: [installing('s0.one', steps)],
      prepare: async () => {
        throw error
      },
    })
    const result = await pending
    expect(result).toEqual({ kind: 'preparation-failed', exitCode: 3, error })
    expect(steps).toEqual([])
    expect(events).toEqual([])
  })

  it('stops at the first entry object whose install throws, naming it', async () => {
    const steps: string[] = []
    const { pending, events } = start(['a'], {
      steps,
      entryObjects: [
        installing('s0.one', steps),
        installing('s0.two', steps, true),
        installing('s0.three', steps),
      ],
    })
    const result = await pending
    expect(result).toMatchObject({ kind: 'entry-failed', exitCode: 3, name: 's0.two' })
    expect(steps).toEqual(['install:s0.one', 'install:s0.two'])
    expect(events).toEqual([])
  })

  it('skips the withheld entry objects and installs the others', async () => {
    const steps: string[] = []
    const { pending } = start(['a'], {
      steps,
      entryObjects: [installing('s0.one', steps), installing('s0.two', steps)],
      omitEntryObjects: [named('s0.one')],
    })
    expect((await pending).kind).toBe('started')
    expect(steps).toEqual(['install:s0.two', 'barrier'])
  })

  it('refuses to withhold a name that is not an entry object, before any install or row', async () => {
    const steps: string[] = []
    const { pending, events } = start(['a'], {
      steps,
      entryObjects: [installing('s0.one', steps)],
      omitEntryObjects: [named('s0.missing')],
    })
    await expect(pending).rejects.toThrow(
      'omitEntryObjects names "s0.missing", which is not an entry object',
    )
    expect(steps).toEqual([])
    expect(events).toEqual([])
  })

  it('creates every row in order and lists them in that order', async () => {
    const { pending } = start(['c', 'a', 'b'])
    const result = await pending
    if (result.kind !== 'started') throw new Error('tree did not start')
    expect(result.rows.map(r => r.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('disposeTree', () => {
  it('disposes rows in reverse load order, then the root, and reports every failure together', async () => {
    const order: string[] = []
    const disposer = (name: string, fail: boolean) => ({
      dispose: async () => {
        order.push(name)
        if (fail) throw new Error(`${name} broke`)
      },
    })
    const rows = [
      { id: 'first', fiber: disposer('first', true) },
      { id: 'second', fiber: disposer('second', false) },
      { id: 'third', fiber: disposer('third', true) },
    ] as unknown as Parameters<typeof disposeTree>[1]
    const root = { fiber: disposer('root', true) } as unknown as Context
    const thrown = await disposeTree(root, rows).catch((error: unknown) => error)
    expect(order).toEqual(['third', 'second', 'first', 'root'])
    expect(thrown).toBeInstanceOf(AggregateError)
    expect((thrown as AggregateError).message).toBe('tree disposal failed')
    expect((thrown as AggregateError).errors.map(e => (e as Error).message)).toEqual([
      'third broke',
      'first broke',
      'root broke',
    ])
  })
})
