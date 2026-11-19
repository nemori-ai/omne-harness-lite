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

async function described(params: unknown) {
  const decoded = tool.decode('send', params)
  if ('failure' in decoded) throw new Error(JSON.stringify(decoded.failure))
  const describe = slotOf('send')?.describeRelease
  if (describe === null || describe === undefined) throw new Error('send gives no description')
  const world = domain()
  await world.emit('e-1')
  const checked = await checkReleaseDescription(
    describe,
    { principal: 'agent', tenant: world.owner.tenant as never, arguments: decoded.ok },
    { state: async () => world.boxOf(person) },
  )
  if ('failure' in checked) throw new Error(checked.failure)
  expect(
    judgeReleaseDescription(checked.ok, undefined, DEFAULT_RELEASE_DETAIL_POLICY),
  ).toHaveProperty('ok')
  return checked.ok.rows
}

describe('what a send would post, shown on its release card', () => {
  it('is given by send alone', () => {
    const describing = tool.registration.operations
      .filter(([, slot]) => slot.describeRelease !== null)
      .map(([name]) => name)
    expect(describing).toEqual(['send'])
  })

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
