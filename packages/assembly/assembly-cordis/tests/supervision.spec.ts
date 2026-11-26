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

  it('换一代：备着的那一代的句柄先放在一边，换的时候替掉旧的；旧的那一代卸载不再动它', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    const removeOld = supervisor.add(handle('a', log))
    supervisor.stage('a')
    const removeNext = supervisor.add({
      ...handle('a', log),
      stop: async () => void log.push('stop:a2'),
    })
    expect(() => supervisor.add(handle('a'))).toThrow(SupervisionRefused)
    const swapped = supervisor.promote('a')
    await swapped?.replaced?.stop(0)
    removeOld()
    await settle()
    expect(log).toEqual(['stop:a'])
    expect(supervisor.liveRows()).toEqual(['a'])
    await supervisor.freeze().live.get('a')?.handle.stop(0)
    expect(log).toEqual(['stop:a', 'stop:a2'])
    removeNext()
    expect(supervisor.promote('a')).toBeUndefined()
  })

  it('备着的那一代没起来：它的句柄收回，在位的不动；没说要换时再交一个照样被拒', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(handle('a', log))
    supervisor.stage('a')
    const removeNext = supervisor.add(handle('a', log))
    removeNext()
    supervisor.unstage('a')
    await settle()
    expect([log, supervisor.liveRows()]).toEqual([[], ['a']])
    expect(() => supervisor.add(handle('a'))).toThrow(SupervisionRefused)
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
  return {
    clock,
    root,
    supervisor,
    store,
    user,
    exits,
    moves,
    unwatch: unwatch.stop,
    watch: unwatch,
  }
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

  it('一行换了一代：从此看新的 fiber；旧的 fiber 卸载不算这一行没了', async () => {
    const { root, user, exits, moves, watch, supervisor } = await watched('restart')
    const next: Fiber = await root.plugin(consumer('user', 'store'))
    watch.replace('user', next)
    await user.dispose()
    await settle()
    expect([moves, exits]).toEqual([[], []])
    await next.dispose()
    await settle()
    expect(moves).toEqual(['user:waiting'])
    expect(supervisor.standings().get('user')).toBe('waiting')
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

describe('行的句柄：登记、撤下与换代的账', () => {
  it('被拒的登记带名字、原因与行', () => {
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(handle('a'))
    let refused: SupervisionRefused | undefined
    try {
      supervisor.add(handle('a'))
    } catch (error) {
      refused = error as SupervisionRefused
    }
    expect([refused?.name, refused?.reason, refused?.row, refused?.message]).toEqual([
      'SupervisionRefused',
      'duplicate',
      'a',
      'row registration refused: duplicate (row a)',
    ])
  })

  it('撤下时给 stop 的期限是此刻加上撤下的时限：不给时限是 1000', async () => {
    const deadlines: number[] = []
    const stop = async (deadline: number) => void deadlines.push(deadline)
    const byDefault = new RowSupervisor({ clock: handClock() })
    byDefault.add({ row: 'a', stop })()
    const given = new RowSupervisor({ clock: handClock(), withdrawalDeadlineMs: 250 })
    const withdrawn = { row: 'a', stop }
    given.add(withdrawn)()
    expect(given.freeze().withdrawn.get('a')).toEqual({
      handle: withdrawn,
      detail: 'disposer stop pending',
    })
    await settle()
    expect(deadlines).toEqual([1000, 250])
  })

  it('stop 的各种结局怎样进记录', async () => {
    const cases: [() => unknown, string][] = [
      [() => undefined, 'disposer stop settled'],
      [() => null, 'disposer stop settled'],
      [() => 'text', 'disposer stop settled'],
      [() => ({ kind: 'timed-out', detail: 'late' }), 'disposer stop timed-out: late'],
      [() => ({ kind: 'failed' }), 'disposer stop failed'],
      [() => ({ kind: 'odd', detail: 5 }), 'disposer stop odd'],
      [
        () => {
          throw new Error('boom')
        },
        'disposer stop failed: boom',
      ],
    ]
    const details: (string | undefined)[] = []
    for (const [result] of cases) {
      const supervisor = new RowSupervisor({ clock: handClock() })
      supervisor.add({ row: 'a', stop: async () => result() } as SupervisedHandle)()
      await settle()
      details.push(supervisor.freeze().withdrawn.get('a')?.detail)
    }
    expect(details).toEqual(cases.map(([, detail]) => detail))
  })

  it('撤下的行再登记：撤下的那条记录不留', async () => {
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(handle('a'))()
    await settle()
    supervisor.add(handle('a'))
    const frozen = supervisor.freeze()
    expect([[...frozen.live.keys()], [...frozen.withdrawn.keys()]]).toEqual([['a'], []])
  })

  it('说了要换又不换：备着的句柄收回，下一次照样能备', () => {
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(handle('a'))
    supervisor.stage('a')
    supervisor.add(handle('a'))
    supervisor.unstage('a')
    expect(supervisor.promote('a')).toBeUndefined()
    supervisor.stage('a')
    supervisor.add(handle('a'))
    expect(() => supervisor.add(handle('a'))).toThrow(SupervisionRefused)
  })

  it('备着的那一代自己卸载：句柄收回，同一次换里还能再备一代', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(handle('a', log))
    supervisor.stage('a')
    supervisor.add(handle('a', log))()
    const second = { ...handle('a', log), stop: async () => void log.push('stop:second') }
    supervisor.add(second)
    expect(supervisor.promote('a')?.serving).toBe(second)
    await settle()
    expect(log).toEqual([])
  })

  it('换过之后：这一次换结束了，换上的那一代卸载就是这一行撤下', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    const first = handle('a', log)
    supervisor.add(first)
    supervisor.stage('a')
    const second = { ...handle('a', log), stop: async () => void log.push('stop:second') }
    const removeSecond = supervisor.add(second)
    expect(supervisor.promote('a')).toEqual({ serving: second, replaced: first })
    expect(supervisor.promote('a')).toBeUndefined()
    expect(() => supervisor.add(handle('a'))).toThrow(SupervisionRefused)
    removeSecond()
    await settle()
    expect([log, supervisor.liveRows()]).toEqual([['stop:second'], []])
  })

  it('备着一代时在位的那一代自己没了：换上去的照样在位，没有被替下的', async () => {
    const supervisor = new RowSupervisor({ clock: handClock() })
    const removeOld = supervisor.add(handle('a'))
    supervisor.stage('a')
    const next = handle('a')
    supervisor.add(next)
    removeOld()
    await settle()
    expect(supervisor.liveRows()).toEqual([])
    expect(supervisor.promote('a')).toEqual({ serving: next, replaced: undefined })
    expect(supervisor.liveRows()).toEqual(['a'])
  })
})

describe('启动：边角', () => {
  it('启动两次只起一次；都起来了监督仍在运行；没有 start 的行跳过；次序里点到不在场的行不碍事', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(handle('a', log))
    supervisor.add({ row: 'quiet', stop: async () => undefined })
    supervisor.add(handle('access', log))
    const order = {
      after: new Map([
        ['a', ['ghost']],
        ['access', ['a', 'ghost']],
      ]),
      last: new Set(['access']),
    }
    expect(await supervisor.startAll(order)).toBeUndefined()
    expect(await supervisor.startAll(order)).toBeUndefined()
    expect(log).toEqual(['start:a', 'start:access'])
    expect([supervisor.state, supervisor.startFailure]).toEqual(['running', undefined])
  })

  it('一行的 start 抛错：隔着一行需要它的也不启动', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    supervisor.add(
      handle('a', log, {
        start: async () => {
          throw new Error('a cannot start')
        },
      }),
    )
    supervisor.add(handle('b', log))
    supervisor.add(handle('c', log))
    const after = new Map([
      ['b', ['a']],
      ['c', ['b']],
    ])
    expect(await supervisor.startAll({ after, last: new Set() })).toEqual({
      row: 'a',
      detail: 'a cannot start',
    })
    expect(log).toEqual([])
  })

  it('启动到一半进入停止中：还没起的行不再起', async () => {
    const log: string[] = []
    const supervisor = new RowSupervisor({ clock: handClock() })
    let open: () => void = () => undefined
    const gate = new Promise<void>(resolve => (open = resolve))
    supervisor.add(
      handle('a', log, {
        start: async () => {
          log.push('start:a')
          await gate
        },
      }),
    )
    supervisor.add(handle('b', log))
    const starting = supervisor.startAll({ after: new Map([['b', ['a']]]), last: new Set() })
    await settle()
    supervisor.enterStopping()
    open()
    expect(await starting).toBeUndefined()
    expect(log).toEqual(['start:a'])
  })
})

/** A clock whose timers a test fires one by one, cancelled or not. */
function looseClock() {
  const asked: number[] = []
  const fires: (() => void)[] = []
  return {
    asked,
    fires,
    now: () => 0,
    after: (ms: number) => {
      asked.push(ms)
      let fire: () => void = () => undefined
      const promise = new Promise<void>(resolve => (fire = resolve))
      fires.push(() => fire())
      return { promise, cancel: () => undefined }
    },
  }
}

describe('看着行：期限与换代的边角', () => {
  async function rerunning(apply?: () => unknown) {
    const clock = looseClock()
    const root = new Context()
    const supervisor = new RowSupervisor({ clock })
    const store: Fiber = await root.plugin(provider('store', 'store'))
    const user: Fiber = await root.plugin(consumer('user', 'store', apply))
    const exits: SupervisedExit[] = []
    supervisor.watch(root, [{ id: 'user', fiber: user, swap: 'rerun' }], {
      dependencyDeadlineMs: 111,
      startDeadlineMs: 222,
      exit: exit => void exits.push(exit),
    })
    return { clock, root, supervisor, store, exits }
  }

  it('等依赖用等依赖的期限，重跑用启动的期限；不给 moved 也照常', async () => {
    const { clock, root, supervisor, store, exits } = await rerunning()
    await store.dispose()
    await settle()
    expect(clock.asked).toEqual([111])
    await root.plugin(provider('store-again', 'store'))
    await settle()
    expect(clock.asked).toEqual([111, 222])
    expect([supervisor.standings().get('user'), exits]).toEqual(['serving', []])
  })

  it('撤掉的期限后来响了：不算数；现在的期限响了才算', async () => {
    let runs = 0
    const { clock, root, store, exits } = await rerunning(() => {
      runs += 1
      return runs > 1 ? new Promise(() => undefined) : undefined
    })
    await store.dispose()
    await settle()
    root.plugin(provider('store-again', 'store'))
    await settle()
    expect(clock.asked).toEqual([111, 222])
    clock.fires[0]?.()
    await settle()
    expect(exits).toEqual([])
    clock.fires[1]?.()
    await settle()
    expect(exits).toEqual([{ code: 3, reason: 'start-deadline', row: 'user' }])
  })

  it('回到在服务之后没有期限挂着', async () => {
    const { clock, root, store, supervisor } = await watched('rerun', undefined, false)
    await store.dispose()
    await settle()
    expect(clock.pending()).toBe(1)
    await root.plugin(provider('store-again', 'store'))
    await settle()
    expect([supervisor.standings().get('user'), clock.pending()]).toEqual(['serving', 0])
  })

  it('开始看的时候这一行还在起：起来了就是在服务，不算没了又回来', async () => {
    const clock = handClock()
    const root = new Context()
    const supervisor = new RowSupervisor({ clock })
    let open: () => void = () => undefined
    const gate = new Promise<void>(resolve => (open = resolve))
    const slow = root.plugin({ name: 'slow', apply: () => gate })
    const moves: string[] = []
    const exits: SupervisedExit[] = []
    supervisor.watch(root, [{ id: 'slow', fiber: slow, swap: 'restart' }], {
      dependencyDeadlineMs: 500,
      startDeadlineMs: 500,
      exit: exit => void exits.push(exit),
      moved: (row, standing) => void moves.push(`${row}:${standing}`),
    })
    open()
    await slow
    await settle()
    expect([moves, exits, clock.pending()]).toEqual([[], [], 0])
    expect(supervisor.standings().get('slow')).toBe('serving')
  })

  it('不再看之后：挂着的期限撤掉，行的来去没人记', async () => {
    const waiting = await watched('restart')
    await waiting.store.dispose()
    await settle()
    expect(waiting.clock.pending()).toBe(2)
    waiting.unwatch()
    expect(waiting.clock.pending()).toBe(0)
    const { store, moves, exits, unwatch } = await watched('restart')
    unwatch()
    await store.dispose()
    await settle()
    expect([moves, exits]).toEqual([[], []])
  })

  it('一行换了一代：别的行照样看着', async () => {
    const { root, store, moves, watch } = await watched('restart')
    const next: Fiber = await root.plugin(consumer('user', 'store'))
    watch.replace('user', next)
    watch.replace('nobody', next)
    await store.dispose()
    await settle()
    expect(moves).toContain('store:waiting')
  })
})

describe('活的树上的依赖边：边角', () => {
  it('还在等依赖的 fiber 不成边；一行的子 fiber 注入这一行自己提供的不成边', async () => {
    const root = new Context()
    const pending = root.plugin({ name: 'pending', inject: ['nowhere'], apply: () => undefined })
    const self: Fiber = await root.plugin({
      name: 'self',
      apply(ctx: Context) {
        ctx.provide('own', {})
        ctx.plugin(consumer('self-child', 'own'))
      },
    })
    await settle()
    const edges = liveEdges(root, [
      { id: 'pending', fiber: pending },
      { id: 'self', fiber: self },
    ])
    expect([...edges]).toEqual([
      ['pending', []],
      ['self', []],
    ])
  })
})
