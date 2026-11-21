import { describe, expect, it } from 'vitest'
import { commit, recheck, type Pending } from '../src/index.ts'

type Script = readonly (Readonly<{ outcome: string; body?: unknown }> | 'throw')[]

function clientOf(sent: Script, queried: Script = []) {
  const calls: [string, unknown][] = []
  const answer = (script: Script, at: number) => {
    const next = script[at]
    if (next === 'throw' || next === undefined) throw new Error('lost')
    return next
  }
  const handler = {
    get(_: unknown, name: string) {
      return async (body: unknown) => {
        calls.push([name, body])
        const asked = calls.filter(
          ([called]) => called.startsWith('query-') === name.startsWith('query-'),
        )
        return answer(name.startsWith('query-') ? queried : sent, asked.length - 1)
      }
    },
  }
  return { client: new Proxy({}, handler) as never, calls }
}

const REGISTER: Pending = {
  name: 'register',
  body: { tenant: 't' as never, operation: 'op-1', address: '/srv/blog' },
}
const GRANT: Pending = {
  name: 'grant-participation',
  body: { tenant: 't' as never, operation: 'op-2', workspace: 'wsp_blog', target: 'u' as never },
}
const REMOVE: Pending = { ...GRANT, name: 'remove' } as Pending

describe('a commit on a workspace and what a person is told', () => {
  it('says each answer, and asks for the list again only when something changed', async () => {
    const cases: [Pending, Readonly<{ outcome: string; body?: unknown }>, string, boolean][] = [
      [REGISTER, { outcome: 'succeeded', body: {} }, '已登记', true],
      [REGISTER, { outcome: 'no-change', body: {} }, '这个目录已经登记过了', true],
      [GRANT, { outcome: 'no-change', body: {} }, '对方已经是参与者了', true],
      [REMOVE, { outcome: 'no-change', body: {} }, '对方本来就不在这个工作区里', true],
      [
        REGISTER,
        { outcome: 'invalid', body: { reason: 'occupied' } },
        '没有登记：这个目录已经属于另一个工作区',
        false,
      ],
      [GRANT, { outcome: 'invalid', body: { reason: 'brand-new' } }, '没有授予：brand-new', false],
      [
        REMOVE,
        { outcome: 'conflict', body: {} },
        '没有移除：和同时进行的改动冲突，读一遍再试',
        false,
      ],
      [GRANT, { outcome: 'denied' }, '没有授予：没有权限', false],
      [REMOVE, { outcome: 'basis-unavailable' }, '没有移除：依据暂时读不到', false],
      [REGISTER, { outcome: 'protocol-rejected' }, '没有登记成：protocol-rejected', false],
    ]
    for (const [pending, answer, text, changed] of cases) {
      const { client, calls } = clientOf([answer])
      expect(await commit(client, pending), text).toEqual({ text, changed, pending: null })
      expect(calls).toEqual([[pending.name, pending.body]])
    }
  })

  it('an end it does not learn is asked again with the same body, once', async () => {
    const done = clientOf([{ outcome: 'unknown' }], [{ outcome: 'succeeded', body: {} }])
    expect(await commit(done.client, GRANT)).toEqual({
      text: '查过了：已授予',
      changed: true,
      pending: null,
    })
    expect(done.calls).toEqual([
      ['grant-participation', GRANT.body],
      ['query-grant-participation', GRANT.body],
    ])
    const lost = clientOf(['throw'], [{ outcome: 'not-committed', body: {} }])
    expect(await commit(lost.client, REMOVE)).toEqual({
      text: '查过了：没有移除成',
      changed: false,
      pending: null,
    })
    const still = clientOf([{ outcome: 'unknown' }], ['throw'])
    expect(await commit(still.client, REGISTER)).toEqual({
      text: '不知道登记成没有，可以再查一次',
      changed: false,
      pending: REGISTER,
    })
    expect(still.calls).toHaveLength(2)
  })

  it('asking again sends only the query, with the body kept', async () => {
    const { client, calls } = clientOf([], [{ outcome: 'basis-unavailable' }])
    expect(await recheck(client, REGISTER)).toMatchObject({ pending: REGISTER })
    expect(calls).toEqual([['query-register', REGISTER.body]])
  })
})
