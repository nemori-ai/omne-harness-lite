// Tool 运行时组的按调用表（见证、origin、账本视图）何时释放：调用的 `settled` 状态是唯一终态（R2-D193 N5）。
// 释放认记录里的 `settled`：本进程提交成功的，和提交答 `unknown` 实际已落盘、之后读到的，都释放。
// 没有终态的调用仍是在途调用，契约不设超时（Ask 无超时，名额不因时间释放），表项留着，不按时间收回。
// 这里用窄的记录仓替身，只给 `lateStore` 要读写的字段；真实 SQL 与五行的贯通在 composition.spec.ts。
import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  callKeyOf,
  lateStore,
  toolRuntimeHolder,
  witnessed,
  type ToolRuntimeHolder,
  type ToolSqlPorts,
} from '../../../src/rows/tool-runtime/holder.ts'

type Phase = 'running' | 'settled'
type Row = Readonly<{ kind: 'call'; call: unknown }>

const TENANT = 'tenant-a'
const execution = { instance: 'i-1' }
const source = { owner: 'o', record: 'r', revision: '1', digest: 'd' }

function row(call: string, phase: Phase): Row {
  return { kind: 'call', call: { tenant: TENANT, call, execution, state: { phase, source } } }
}

/** 记录仓替身：`rows` 是下一次读答的记录；`commitAnswer` 是提交的答复，`landed` 为真时提交的写入也进 `rows`。 */
function world() {
  const holder: ToolRuntimeHolder = toolRuntimeHolder({ root: {} } as unknown as Context)
  const state = {
    rows: [] as Row[],
    commitAnswer: 'committed' as 'committed' | 'unknown',
    landed: true,
  }
  holder.sql = {
    store: {
      durability: 'durable',
      read: async () => ({ kind: 'complete', revision: '1', records: state.rows }),
      commit: async (input: unknown) => {
        if (state.landed)
          for (const write of (input as { writes: { record: Row }[] }).writes)
            state.rows = [...state.rows.filter(r => r !== write.record), write.record]
        return { kind: state.commitAnswer, diagnostic: 'lost' }
      },
    },
  } as unknown as ToolSqlPorts
  const store = lateStore(holder)
  const forgotten: string[] = []
  holder.settled.add(key => forgotten.push(key))
  const domain = { kind: 'call', tenant: TENANT, call: 'c' } as never
  const settledPut = (call: string) =>
    ({
      domain,
      expected: '1',
      revision: '2',
      writes: [{ kind: 'put', record: row(call, 'settled') }],
    }) as never
  return { holder, state, store, forgotten, domain, settledPut }
}

const isWitnessed = (holder: ToolRuntimeHolder, call: string) =>
  witnessed(holder, execution, source, [TENANT, call])

describe('per-call tables release on the settled state', () => {
  it('a call read as running is witnessed, and stays so: no timeout releases an unsettled call', async () => {
    const { holder, state, store, forgotten, domain } = world()
    state.rows = [row('c1', 'running')]
    await store.read(domain)
    await store.read(domain)
    expect(isWitnessed(holder, 'c1')).toBe(true)
    expect(forgotten).toEqual([])
  })

  it('a settled commit that the store confirms releases the call and tells the tables', async () => {
    const { holder, state, store, forgotten, domain, settledPut } = world()
    state.rows = [row('c1', 'running')]
    await store.read(domain)
    await store.commit(settledPut('c1'))
    expect(isWitnessed(holder, 'c1')).toBe(false)
    expect(forgotten).toEqual([callKeyOf(TENANT, 'c1')])
  })

  it('a settled commit answered unknown but landed is released by the next read of the settled record', async () => {
    const { holder, state, store, forgotten, domain, settledPut } = world()
    state.commitAnswer = 'unknown'
    state.rows = [row('c1', 'running')]
    await store.read(domain)
    await store.commit(settledPut('c1'))
    expect(isWitnessed(holder, 'c1')).toBe(true)
    await store.read(domain)
    expect(isWitnessed(holder, 'c1')).toBe(false)
    expect(forgotten).toEqual([callKeyOf(TENANT, 'c1')])
  })

  it('a read of a settled record does not witness it again, and leaves other calls alone', async () => {
    const { holder, state, store, forgotten, domain } = world()
    state.rows = [row('c1', 'running'), row('c2', 'running')]
    await store.read(domain)
    state.rows = [row('c1', 'settled'), row('c2', 'running')]
    await store.read(domain)
    expect(isWitnessed(holder, 'c1')).toBe(false)
    expect(isWitnessed(holder, 'c2')).toBe(true)
    expect(forgotten).toEqual([callKeyOf(TENANT, 'c1')])
  })
})
