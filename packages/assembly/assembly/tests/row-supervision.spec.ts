import { describe, expect, it } from 'vitest'
import { superviseRow, type RowEvent, type RowStanding } from '../src/index.ts'

const EVENTS: readonly RowEvent[] = ['left', 'returning', 'started', 'threw', 'deadline']
const unchanged = (standing: RowStanding) => ({ standing, actions: [] })

describe('一行在监督下的全化表', () => {
  it('在服务：依赖没了就等依赖并起期限；别的事件不可达，什么都不变', () => {
    expect(superviseRow('serving', 'left', 'restart')).toEqual({
      standing: 'waiting',
      actions: [{ kind: 'arm', deadline: 'dependency' }],
    })
    for (const event of EVENTS.filter(each => each !== 'left'))
      expect(superviseRow('serving', event, 'restart')).toEqual(unchanged('serving'))
  })

  it('等依赖：期限到了，进程带着原因以 4 退出', () => {
    expect(superviseRow('waiting', 'deadline', 'restart')).toEqual({
      standing: 'waiting',
      actions: [{ kind: 'exit', code: 4, reason: 'dependency-deadline' }],
    })
  })

  it('等依赖：依赖回来了，声明换进程的行让进程有计划地退出', () => {
    expect(superviseRow('waiting', 'returning', 'restart')).toEqual({
      standing: 'waiting',
      actions: [{ kind: 'disarm' }, { kind: 'exit', code: 0, reason: 'row-returned' }],
    })
  })

  it('等依赖：依赖回来了，声明重跑或换实现的行进入启动中，是新的一代', () => {
    for (const swap of ['rerun', 'implementation'] as const)
      expect(superviseRow('waiting', 'returning', swap)).toEqual({
        standing: 'starting',
        actions: [{ kind: 'disarm' }, { kind: 'arm', deadline: 'start' }],
      })
  })

  it('等依赖：别的事件什么都不变', () => {
    for (const event of ['left', 'started', 'threw'] as const)
      expect(superviseRow('waiting', event, 'rerun')).toEqual(unchanged('waiting'))
  })

  it('启动中：成了回到在服务；依赖又没了回到等依赖；抛错或到期以 3 退出', () => {
    expect(superviseRow('starting', 'started', 'rerun')).toEqual({
      standing: 'serving',
      actions: [{ kind: 'disarm' }],
    })
    expect(superviseRow('starting', 'left', 'rerun')).toEqual({
      standing: 'waiting',
      actions: [{ kind: 'disarm' }, { kind: 'arm', deadline: 'dependency' }],
    })
    expect(superviseRow('starting', 'threw', 'rerun')).toEqual({
      standing: 'failed',
      actions: [{ kind: 'disarm' }, { kind: 'exit', code: 3, reason: 'start-failed' }],
    })
    expect(superviseRow('starting', 'deadline', 'rerun')).toEqual({
      standing: 'starting',
      actions: [{ kind: 'exit', code: 3, reason: 'start-deadline' }],
    })
    expect(superviseRow('starting', 'returning', 'rerun')).toEqual(unchanged('starting'))
  })

  it('起不来：任何事件都不变', () => {
    for (const event of EVENTS)
      expect(superviseRow('failed', event, 'rerun')).toEqual(unchanged('failed'))
  })
})
