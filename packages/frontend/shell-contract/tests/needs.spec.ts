import type { Context } from '@deepseek-ai/cordis'
import { ask, declare, type Contract, type Entry } from '@omne-harness/dynamis'
import { describe, expect, it } from 'vitest'
import {
  definePoint,
  needPoint,
  needProtocol,
  serviceKey,
  type Need,
} from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { render, startShell } from './reference-shell.ts'

const PROTOCOLS = 'connection.protocols'

const protocols: Contract = {
  name: PROTOCOLS,
  tree: 'client',
  arity: 'keyed-one',
  keyFrom: null,
  key: 'the protocol name and its major',
  gives: 'the client of this major',
  item: { kind: 'pure', fields: { protocol: 'string', major: 'number', client: 'object' } },
  resolve: 'conflict',
  binding: 'run',
  onError: 'a call answers unavailable',
  version: 1,
  revision: 1,
  keys: 'private',
  conformance: null,
  summary: 'The protocols this client can call now.',
}

type Notes = { ping(body: object): Promise<{ outcome: string }> }

const served = (name: string, major: number, calls: string[]): Entry => ({
  point: PROTOCOLS,
  key: `${name}/v${major}`,
  id: '',
  scope: [],
  rank: 0,
  digest: `${name}/v${major}`,
  item: {
    protocol: name,
    major,
    client: {
      ping: async () => {
        calls.push(`${name}/v${major}`)
        return { outcome: 'succeeded' }
      },
      observe: {},
    },
  },
})

/** A shell, the protocols point, and a way to serve and withdraw a protocol as its own fiber. */
async function world() {
  const started = await startShell()
  const calls: string[] = []
  await started.root.plugin({
    name: 'connection',
    inject: ['dynamis'],
    apply: (ctx: Context) => void ctx.dynamis.put([declare(protocols)]),
  })
  const serve = async (name: string, major: number) => {
    const fiber = started.root.plugin({
      name: `client:${name}/v${major}`,
      inject: ['dynamis'],
      apply: (ctx: Context) => void ctx.dynamis.put([served(name, major, calls)]),
    })
    await fiber.await()
    return fiber
  }
  return { ...started, calls, serve }
}

const NOTES = { name: 'notes', major: 1 }
const TASKS = { name: 'tasks', major: 1 }

function moduleOf(name: string, needs: Record<string, Need>, seen?: (bound: never) => void) {
  return defineUiModule({
    name,
    needs,
    apply(shell, bound) {
      seen?.(bound as never)
      shell.contribute('pages', { id: name, title: name, order: 0, icon: 'topics', render })
    },
  })
}

describe('a view module that declares its needs', () => {
  it('loads with the shell alone: what it needs may come later, or never', async () => {
    const w = await world()
    await w.root.plugin(moduleOf('notes-ui', { notes: needProtocol<Notes>(NOTES) }))
    expect(w.shell.items('pages').map(page => page.id)).toEqual(['notes-ui'])
    expect(w.shell.adoption('notes-ui')).toMatchObject({
      kind: 'unavailable',
      missing: [{ slot: 'notes', answer: 'none' }],
    })
    expect(w.shell.owner('pages', 'notes-ui')).toBe('notes-ui')
  })

  it('the adoption is one value: the same modules loaded in any order pin the same things', async () => {
    const pinned = async (order: readonly string[]) => {
      const w = await world()
      const modules: Record<string, ReturnType<typeof moduleOf>> = {
        a: moduleOf('a-ui', { notes: needProtocol<Notes>(NOTES), tasks: needProtocol(TASKS) }),
        b: moduleOf('b-ui', { tasks: needProtocol(TASKS) }),
        serve: { name: 'serve', apply: () => undefined },
      }
      for (const step of order) {
        if (step === 'serve') {
          await w.serve('notes', 1)
          await w.serve('tasks', 1)
        } else await w.root.plugin(modules[step]!)
      }
      return [w.shell.adoption('a-ui'), w.shell.adoption('b-ui')]
    }
    const first = await pinned(['serve', 'a', 'b'])
    expect(first[0]).toMatchObject({ kind: 'adopted' })
    expect(JSON.stringify(await pinned(['b', 'a', 'serve']))).toBe(JSON.stringify(first))
    expect(JSON.stringify(await pinned(['a', 'serve', 'b']))).toBe(JSON.stringify(first))
  })

  it('with two majors served it takes the first the need names; a need for one major never takes another', async () => {
    const w = await world()
    await w.serve('notes', 1)
    await w.serve('notes', 2)
    await w.root.plugin(moduleOf('new-ui', { notes: needProtocol(NOTES, { majors: [2, 1] }) }))
    await w.root.plugin(moduleOf('old-ui', { notes: needProtocol(NOTES, { majors: [1, 2] }) }))
    await w.root.plugin(moduleOf('only3-ui', { notes: needProtocol({ name: 'notes', major: 3 }) }))
    const keyOf = (module: string) => {
      const adoption = w.shell.adoption(module)
      return adoption?.kind === 'adopted' ? adoption.bindings['notes']?.key : adoption?.kind
    }
    expect(keyOf('new-ui')).toBe('notes/v2')
    expect(keyOf('old-ui')).toBe('notes/v1')
    expect(keyOf('only3-ui')).toBe('unavailable')
  })

  it('the client it is given is always there: a call goes out only while its need is pinned', async () => {
    const w = await world()
    let notes: Notes | undefined
    await w.root.plugin(
      moduleOf('notes-ui', { notes: needProtocol<Notes>(NOTES) }, bound => {
        notes = (bound as { notes: Notes }).notes
      }),
    )
    expect(await notes!.ping({})).toEqual({ outcome: 'unavailable' })
    expect(w.calls).toEqual([])
    const serving = await w.serve('notes', 1)
    expect(await notes!.ping({})).toEqual({ outcome: 'succeeded' })
    expect(w.calls).toEqual(['notes/v1'])
    await serving.dispose()
    expect(await notes!.ping({})).toEqual({ outcome: 'unavailable' })
    expect(w.calls).toEqual(['notes/v1'])
    expect(w.shell.adoption('notes-ui')).toMatchObject({ kind: 'unavailable' })
  })

  it('one protocol less touches only the modules that name it', async () => {
    const w = await world()
    const notes = await w.serve('notes', 1)
    await w.serve('tasks', 1)
    await w.root.plugin(moduleOf('notes-ui', { notes: needProtocol(NOTES) }))
    await w.root.plugin(moduleOf('tasks-ui', { tasks: needProtocol(TASKS) }))
    const told: string[] = []
    w.shell.watchAdoptions(() => told.push(w.shell.adoption('notes-ui')?.kind ?? 'none'))
    await notes.dispose()
    expect(w.shell.adoption('notes-ui')).toMatchObject({
      kind: 'unavailable',
      missing: [{ slot: 'notes', reference: { point: PROTOCOLS, anyOf: ['notes/v1'] } }],
    })
    expect(w.shell.adoption('tasks-ui')).toMatchObject({ kind: 'adopted' })
    expect(told.at(-1)).toBe('unavailable')
    await w.serve('notes', 1)
    expect(w.shell.adoption('notes-ui')).toMatchObject({ kind: 'adopted' })
    expect(told.at(-1)).toBe('adopted')
  })

  it('an optional need that is not there leaves the module adopted, with nothing in that slot', async () => {
    const w = await world()
    await w.root.plugin(moduleOf('notes-ui', { notes: needProtocol(NOTES, { optional: true }) }))
    expect(w.shell.adoption('notes-ui')).toEqual({ kind: 'adopted', bindings: { notes: null } })
  })

  it('a need for a point reads what is on it now, and nothing when it is not there', async () => {
    const w = await world()
    let choices: { get(): unknown; subscribe(listener: () => void): () => void } | undefined
    await w.root.plugin(
      moduleOf(
        'picker-ui',
        { choices: needPoint<string[]>('test.a', { optional: true }) },
        bound => {
          choices = (bound as { choices: typeof choices }).choices
        },
      ),
    )
    expect(choices!.get()).toBeUndefined()
    expect(w.shell.adoption('picker-ui')).toEqual({ kind: 'adopted', bindings: { choices: null } })
  })

  it('a module that declares no needs has no adoption to speak of, and its needs go when it unloads', async () => {
    const w = await world()
    const fiber = w.root.plugin(moduleOf('notes-ui', { notes: needProtocol(NOTES) }))
    await fiber.await()
    expect(w.shell.adoption('nobody')).toBeUndefined()
    await fiber.dispose()
    expect(w.shell.adoption('notes-ui')).toBeUndefined()
  })

  const settled = async () => {
    for (let round = 0; round < 8; round += 1) await new Promise(resolve => setTimeout(resolve, 0))
  }

  it('applies once for each adoption: what it made for the last one is taken back before the next', async () => {
    const w = await world()
    const log: string[] = []
    await w.root.plugin(
      defineUiModule({
        name: 'notes-ui',
        needs: { notes: needProtocol<Notes>(NOTES) },
        apply(shell) {
          const turn = log.filter(line => line.startsWith('apply')).length + 1
          log.push(`apply ${turn}`)
          shell.contribute('pages', {
            id: 'notes',
            title: '笔记',
            order: 0,
            icon: 'topics',
            render,
          })
          return () => void log.push(`back ${turn}`)
        },
      }),
    )
    await settled()
    expect(log).toEqual(['apply 1'])
    const serving = await w.serve('notes', 1)
    await settled()
    expect(log).toEqual(['apply 1', 'back 1', 'apply 2'])
    await w.serve('tasks', 1)
    await settled()
    expect(log).toHaveLength(3)
    await serving.dispose()
    await settled()
    expect(log).toEqual(['apply 1', 'back 1', 'apply 2', 'back 2', 'apply 3'])
    expect(w.shell.items('pages').map(page => page.id)).toEqual(['notes'])
    expect(w.shell.owner('pages', 'notes')).toBe('notes-ui')
  })

  it('while a required need is missing it puts its pages and its gate, nothing on the sidebar or an attached point, and provides nothing', async () => {
    const w = await world()
    const offered = serviceKey<{ text: string }>('notes.offer')
    const spot = definePoint({
      name: 'test.a',
      subject: { encode: (value: string) => value, decode: (value: string) => value },
    })
    await w.root.plugin(
      defineUiModule({
        name: 'notes-ui',
        needs: { notes: needProtocol<Notes>(NOTES) },
        apply(shell, _bound, provide) {
          shell.contribute('pages', {
            id: 'notes',
            title: '笔记',
            order: 0,
            icon: 'topics',
            render,
          })
          shell.contribute('gate', { id: 'notes.gate', render })
          shell.contribute('sidebar', { id: 'notes.side', order: 0, render })
          spot.contribute(shell, { id: 'notes.attached', order: 0, render })
          provide(offered, { text: 'the offer' })
        },
      }),
    )
    await settled()
    const there = () => ({
      pages: w.shell.items('pages').length,
      gate: w.shell.items('gate').length,
      sidebar: w.shell.items('sidebar').length,
      attached: w.shell.items('attached').length,
      offered: ask(w.shell.registry(), offered, '', []).kind,
    })
    expect(there()).toMatchObject({ pages: 1, gate: 1, sidebar: 0, attached: 0 })
    expect(there().offered).not.toBe('one')
    await w.serve('notes', 1)
    await settled()
    expect(there()).toEqual({ pages: 1, gate: 1, sidebar: 1, attached: 1, offered: 'one' })
  })
})
