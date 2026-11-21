import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RELEASE_DETAIL_POLICY,
  judgeReleaseDescription,
} from '@omne-harness/tool-contract/provider'
import { checkReleaseDescription } from '@omne-harness/tool-contract/testing'
import { author, domain, person } from './world.ts'

const tool = author()
const slotOf = (command: string) =>
  tool.registration.operations.find(([name]) => name === command)?.[1]

async function describedAs(command: 'send' | 'subscribe', params: unknown) {
  const decoded = tool.decode(command, params)
  if ('failure' in decoded) throw new Error(JSON.stringify(decoded.failure))
  const describe = slotOf(command)?.describeRelease
  if (describe === null || describe === undefined)
    throw new Error(`${command} gives no description`)
  const world = domain()
  await world.emit('e-1')
  const checked = await checkReleaseDescription(
    describe,
    {
      principal: 'agent',
      tenant: world.owner.tenant as never,
      arguments: decoded.ok,
      signal: new AbortController().signal,
    },
    { state: async () => [await world.boxOf(person), world.store.commits()] },
  )
  if ('failure' in checked) throw new Error(checked.failure)
  expect(
    judgeReleaseDescription(checked.ok, undefined, DEFAULT_RELEASE_DETAIL_POLICY),
  ).toHaveProperty('ok')
  return checked.ok.rows
}
const described = (params: unknown) => describedAs('send', params)

it('the release card is described for send and subscribe alone', () => {
  const describing = tool.registration.operations
    .filter(([, slot]) => slot.describeRelease !== null)
    .map(([name]) => name)
  expect(describing.sort()).toEqual(['send', 'subscribe'])
})

describe('what a subscribe would set, shown on its release card', () => {
  const changed = { source: 'demo.things', type: 'changed' }

  it('names the source, the type, the scope, the level and the term, and no note when there is none', async () => {
    expect(await describedAs('subscribe', { ...changed, level: 'strong' })).toEqual([
      { label: '来源', value: 'demo.things' },
      { label: '事件类型', value: 'changed' },
      { label: '范围', value: '全部' },
      { label: '强弱', value: '强提醒' },
      { label: '期限', value: '一直有效' },
    ])
  })

  it.each([
    [{ kind: 'all' }, { kind: 'standing' }, '全部', '一直有效'],
    [{ kind: 'subject', equals: 'repo/a' }, { kind: 'once' }, '对象是「repo/a」', '只收下一条'],
    [
      { kind: 'subject-prefix', prefix: 'repo/' },
      { kind: 'until', at: '2026-12-01T00:00:00.000Z' },
      '对象以「repo/」开头',
      '到 2026-12-01T00:00:00.000Z 为止',
    ],
  ])('writes the scope %j and the term %j as words', async (scope, term, scopeText, termText) => {
    const rows = await describedAs('subscribe', { ...changed, level: 'off', scope, term })
    expect(rows.slice(2)).toEqual([
      { label: '范围', value: scopeText },
      { label: '强弱', value: '不收' },
      { label: '期限', value: termText },
    ])
  })

  it('labels the note as the agent wrote it', async () => {
    const rows = await describedAs('subscribe', { ...changed, level: 'weak', note: '失败了就开卡' })
    expect(rows.at(-1)).toEqual({ label: '备注（agent 填的）', value: '失败了就开卡' })
    expect(rows.find(row => row.label === '强弱')).toEqual({ label: '强弱', value: '弱提醒' })
  })
})

describe('what a send would post, shown on its release card', () => {
  it('names the owner as the recipient, the title and the body, reading and writing nothing', async () => {
    expect(await described({ id: 'p-1', title: '构建好了', body: '主干的构建通过了' })).toEqual([
      { label: '收件人', value: '你' },
      { label: '标题', value: '构建好了' },
      { label: '正文', value: '主干的构建通过了' },
    ])
  })

  it('says which earlier post it replaces, and whether replacing alerts again', async () => {
    expect(await described({ id: 'p-2', title: '日报', replace: 'daily', renotify: true })).toEqual(
      [
        { label: '收件人', value: '你' },
        { label: '标题', value: '日报' },
        { label: '替换', value: '顶替替换键为「daily」的旧一条' },
        { label: '顶替时再提醒', value: '是' },
      ],
    )
    expect((await described({ id: 'p-3', title: '日报', replace: 'daily' })).at(-1)).toEqual({
      label: '顶替时再提醒',
      value: '否',
    })
  })

  it('shows no body row for a blank body, and a body of exactly one row as written', async () => {
    expect((await described({ id: 'p-5', title: 'T', body: '   ' })).map(row => row.label)).toEqual(
      ['收件人', '标题'],
    )
    const whole = '字'.repeat(500)
    expect((await described({ id: 'p-6', title: 'T', body: whole })).at(-1)).toEqual({
      label: '正文',
      value: whole,
    })
  })

  it('shows the opening of a long body within the budget of one row', async () => {
    const rows = await described({ id: 'p-4', title: 'T', body: '字'.repeat(900) })
    const body = rows.find(row => row.label === '正文')?.value
    expect(typeof body === 'string' && [...body].length).toBe(500)
    expect(typeof body === 'string' && body.endsWith('…')).toBe(true)
  })
})
