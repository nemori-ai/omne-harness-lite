import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RELEASE_DETAIL_POLICY,
  judgeReleaseDescription,
} from '@omne-harness/tool-contract/provider'
import { checkReleaseDescription } from '@omne-harness/tool-contract/testing'
import { author } from './world.ts'

const tool = author()
const slotOf = (command: string) =>
  tool.registration.operations.find(([name]) => name === command)?.[1]

async function described(command: string, params: unknown) {
  const decoded = tool.decode(command, params)
  if ('failure' in decoded) throw new Error(JSON.stringify(decoded.failure))
  const describe = slotOf(command)?.describeRelease
  if (describe === null || describe === undefined) throw new Error(`${command} gives none`)
  const checked = await checkReleaseDescription(
    describe,
    {
      principal: 'agent',
      tenant: 'tenant-a' as never,
      arguments: decoded.ok,
      signal: new AbortController().signal,
    },
    { state: async () => 'unchanged' },
  )
  if ('failure' in checked) throw new Error(checked.failure)
  expect(
    judgeReleaseDescription(checked.ok, undefined, DEFAULT_RELEASE_DETAIL_POLICY),
  ).toHaveProperty('ok')
  return checked.ok.rows
}

it('the release card is described for the four writes alone', () => {
  const describing = tool.registration.operations
    .filter(([, slot]) => slot.describeRelease !== null)
    .map(([name]) => name)
  expect(describing.sort()).toEqual(['disable', 'enable', 'publish', 'remove'])
})

describe('what a write would do, shown on its release card', () => {
  it('a publish names the category, the name and where it comes from', async () => {
    const base = { id: 'p1', category: 'bundle', name: 'pill-send' }
    expect(await described('publish', { ...base, dir: 'plugins/pill-send' })).toEqual([
      { label: '动作', value: '发布并持有' },
      { label: '类别', value: 'bundle' },
      { label: '名字', value: 'pill-send' },
      { label: '从哪发布', value: '工作区目录 plugins/pill-send' },
    ])
    expect((await described('publish', { ...base, data: { text: 'x' } })).at(-1)).toEqual({
      label: '从哪发布',
      value: '一份正文',
    })
  })

  it.each([
    ['enable', '启用'],
    ['disable', '禁用'],
    ['remove', '移除'],
  ])('%s names the action, the category and the name', async (command, action) => {
    expect(await described(command, { id: 'x1', category: 'note', name: 'a' })).toEqual([
      { label: '动作', value: action },
      { label: '类别', value: 'note' },
      { label: '名字', value: 'a' },
    ])
  })
})
