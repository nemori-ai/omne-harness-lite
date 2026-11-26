import { Context, type Fiber, type Plugin } from '@deepseek-ai/cordis'
import { startsAfter } from '@omne-harness/assembly'
import { describe, expect, it } from 'vitest'
import {
  liveEdges,
  RowSupervisor,
  SupervisionRefused,
  type SupervisedExit,
  type SupervisedHandle,
} from '../src/cordis.ts'

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 5))

/** A clock a test moves by hand: every timer armed so far fires when the test says so. */
function handClock() {
  let now = 0
  const armed: { fire: () => void; cancelled: boolean }[] = []
  return {
    now: () => now,
    after: () => {
      let fire: () => void = () => undefined
      const timer = { fire: () => fire(), cancelled: false }
      const promise = new Promise<void>(resolve => (fire = resolve))
      armed.push(timer)
      return { promise, cancel: () => void (timer.cancelled = true) }
    },
    expire: () => {
      now += 1000
      for (const timer of armed.splice(0)) if (!timer.cancelled) timer.fire()
    },
    pending: () => armed.filter(timer => !timer.cancelled).length,
  }
}

const handle = (row: string, log: string[] = [], over: Partial<SupervisedHandle> = {}) => ({
  row,
  start: async () => void log.push(`start:${row}`),
  stop: async () => {
    log.push(`stop:${row}`)
    return { kind: 'settled' }
  },
  ...over,
})

describe('行的句柄', () => {
  it('同一行在位时再登记被拒；停止中登记被拒；撤下之后可以再登记', () => {
    const supervisor = new RowSupervisor({ clock: handClock() })
    const remove = supervisor.add(handle('a'))
    expect(() => supervisor.add(handle('a'))).toThrow(SupervisionRefused)
    remove()
    remove()
    expect(supervisor.liveRows()).toEqual([])
    supervisor.add(handle('a'))
    supervisor.enterStopping()
    try {
      supervisor.add(handle('b'))
      throw new Error('taken')
    } catch (error) {
      expect((error as SupervisionRefused).reason).toBe('stopping')
    }
  })

  it('运行中撤下的行：调一次它的 stop，结果只进记录；冻结之后撤下的不动', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    const removeA = supervisor.add(handle('a', log))
    const removeB = supervisor.add(handle('b', log))
    removeA()
    await settle()
    expect(log).toEqual(['stop:a'])
    const frozen = supervisor.freeze()
    removeB()
    await settle()
    expect(log).toEqual(['stop:a'])
    expect([...frozen.live.keys()]).toEqual(['b'])
    expect(frozen.withdrawn.get('a')?.detail).toBe('disposer stop settled')
  })

  it('once：再次请求得到同一个结果，不再执行', async () => {
    const supervisor = new RowSupervisor<SupervisedHandle, number>({ clock: handClock() })
    let runs = 0
    const first = supervisor.once(async () => (runs += 1))
    const second = supervisor.once(async () => (runs += 1))
    expect([await first, await second, runs]).toEqual([1, 1, 1])
  })
})

describe('启动的次序由依赖图定', () => {
  const order = (edges: [string, string[]][], last: string[] = []) => ({
    after: startsAfter(new Map(edges)),
    last: new Set(last),
  })

  it('一行在它需要的行之后启动；接入行在所有别的行之后', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    for (const row of ['entry', 'session', 'identity', 'storage', 'lonely'])
      supervisor.add(handle(row, log))
    const failure = await supervisor.startAll(
      order(
        [
          ['entry', []],
          ['session', ['identity']],
          ['identity', ['storage']],
          ['storage', []],
          ['lonely', []],
        ],
        ['entry'],
      ),
    )
    expect(failure).toBeUndefined()
    expect(log).toEqual([
      'start:storage',
      'start:lonely',
      'start:identity',
      'start:session',
      'start:entry',
    ])
  })

  it('一行的 start 抛错：需要它的行与接入行不启动，结局点名这一行，监督进入停止中', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(handle('entry', log))
    supervisor.add(handle('session', log))
    supervisor.add(
      handle('identity', log, {
        start: async () => {
          throw new Error('no keys')
        },
      }),
    )
    supervisor.add(handle('other', log))
    const failure = await supervisor.startAll(
      order(
        [
          ['entry', []],
          ['session', ['identity']],
          ['identity', []],
          ['other', []],
        ],
        ['entry'],
      ),
    )
    expect(failure).toEqual({ row: 'identity', detail: 'no keys' })
    expect(log).toEqual(['start:other'])
    expect([supervisor.state, supervisor.startFailure]).toEqual(['stopping', failure])
    expect(await supervisor.startAll()).toBeUndefined()
  })

  it('不给次序：按登记的次序一起启动', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(handle('b', log))
    supervisor.add(handle('a', log))
    await supervisor.startAll()
    expect(log).toEqual(['start:b', 'start:a'])
  })
})

const provider = (name: string, key: string): Plugin.Object => ({
  name,
  apply: (ctx: Context) => void ctx.provide(key, { from: name }),
})
const consumer = (name: string, key: string, apply: () => unknown = () => undefined) =>
  ({ name, inject: [key], apply }) satisfies Plugin.Object

async function watched(swap: 'restart' | 'rerun', apply?: () => unknown, both = true) {
  const clock = handClock()
  const root = new Context()
  const supervisor = new RowSupervisor({ clock })
  const store: Fiber = await root.plugin(provider('store', 'store'))
  const user: Fiber = await root.plugin(consumer('user', 'store', apply))
  const exits: SupervisedExit[] = []
  const moves: string[] = []
  const unwatch = supervisor.watch(
    root,
    [
      ...(both ? [{ id: 'store', fiber: store, swap: 'restart' as const }] : []),
      { id: 'user', fiber: user, swap },
    ],
    {
      dependencyDeadlineMs: 500,
      startDeadlineMs: 500,
      exit: exit => void exits.push(exit),
      moved: (row, standing) => void moves.push(`${row}:${standing}`),
    },
  )
  return { clock, root, supervisor, store, user, exits, moves, unwatch }
}

describe('运行中一行没了', () => {
  it('一行被撤下不回来：它与依赖它的行进入等依赖；期限到了以 4 退出并点名', async () => {
    const { clock, store, exits, moves, supervisor } = await watched('restart')
    await store.dispose()
    await settle()
    expect(moves.sort()).toEqual(['store:waiting', 'user:waiting'])
    expect(exits).toEqual([])
    clock.expire()
    await settle()
    expect(exits).toHaveLength(1)
    expect(exits[0]).toMatchObject({ code: 4, reason: 'dependency-deadline' })
    expect(['store', 'user']).toContain(exits[0]?.row)
    expect(supervisor.standings().get('user')).toBe('waiting')
  })

  it('依赖回来了，声明换进程的行：进程有计划地退出，期限撤掉', async () => {
    const { clock, root, store, exits } = await watched('restart')
    await store.dispose()
    await settle()
    await root.plugin(provider('store-again', 'store'))
    await settle()
    expect(exits).toEqual([{ code: 0, reason: 'row-returned', row: 'user' }])
    clock.expire()
    await settle()
    expect(exits).toHaveLength(1)
  })

  it('依赖回来了，声明重跑的行：它重跑，回到在服务；撤下的那一行还在等', async () => {
    const { clock, root, store, exits, moves, supervisor } = await watched('rerun')
    await store.dispose()
    await settle()
    await root.plugin(provider('store-again', 'store'))
    await settle()
    expect(moves).toContain('user:starting')
    expect(supervisor.standings().get('user')).toBe('serving')
    expect(exits).toEqual([])
    clock.expire()
    await settle()
    expect(exits).toEqual([{ code: 4, reason: 'dependency-deadline', row: 'store' }])
  })

  it('一行自己重启，没有经过等着的状态：照样算没了又回来', async () => {
    const { user, exits, moves } = await watched('restart')
    await user.restart()
    await settle()
    expect(moves).toEqual(['user:waiting'])
    expect(exits).toEqual([{ code: 0, reason: 'row-returned', row: 'user' }])
  })

  it('重跑的行 apply 抛错：以 3 退出并点名', async () => {
    let runs = 0
    const { root, store, exits, supervisor } = await watched('rerun', () => {
      runs += 1
      if (runs > 1) throw new Error('cannot start again')
    })
    await store.dispose()
    await settle()
    root.plugin(provider('store-again', 'store'))
    await settle()
    expect(exits).toEqual([{ code: 3, reason: 'start-failed', row: 'user' }])
    expect(supervisor.standings().get('user')).toBe('failed')
  })

  it('重跑的行到了启动的期限还没起来：以 3 退出', async () => {
    let runs = 0
    const hangs = (): unknown => {
      runs += 1
      return runs > 1 ? new Promise(() => undefined) : undefined
    }
    const { clock, root, store, exits } = await watched('rerun', hangs, false)
    await store.dispose()
    await settle()
    root.plugin(provider('store-again', 'store'))
    await settle()
    clock.expire()
    await settle()
    expect(exits).toEqual([{ code: 3, reason: 'start-deadline', row: 'user' }])
  })

  it('停止中：行的来去不再看；不再看之后期限也撤掉', async () => {
    const { clock, store, exits, moves, supervisor, unwatch } = await watched('restart')
    supervisor.enterStopping()
    await store.dispose()
    await settle()
    expect([moves, exits]).toEqual([[], []])
    unwatch()
    expect(clock.pending()).toBe(0)
  })
})

describe('活的树上的依赖边', () => {
  it('子 fiber 的注入也算这一行的边；根上提供的不成边', async () => {
    const root = new Context()
    root.provide('rooted', {})
    const store: Fiber = await root.plugin(provider('store', 'store'))
    const identity: Fiber = await root.plugin({
      name: 'identity',
      inject: ['store', 'rooted'],
      apply: (ctx: Context) => void ctx.provide('identity', {}),
    })
    const session: Fiber = await root.plugin({
      name: 'session',
      inject: ['rooted'],
      apply: (ctx: Context) => void ctx.plugin(consumer('session-child', 'identity')),
    })
    await settle()
    const edges = liveEdges(root, [
      { id: 'store', fiber: store },
      { id: 'identity', fiber: identity },
      { id: 'session', fiber: session },
    ])
    expect([...edges]).toEqual([
      ['store', []],
      ['identity', ['store']],
      ['session', ['identity']],
    ])
  })
})
