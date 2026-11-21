import { describe, expect, it } from 'vitest'
import { createWorkspaceChoices } from '../src/index.ts'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const summary = (workspace: string) => ({ workspace, type: 'filesystem', standing: 'owner' })
const instance = (id: string, availability: Record<string, unknown>) => ({
  instance: id,
  address: `/srv/${id}`,
  availability,
})
const views: Record<string, unknown> = {
  wsp_blog: {
    ...summary('wsp_blog'),
    instances: [
      instance('wsi_main', { kind: 'available', directory: '/srv/wsi_main', basis: 'b' }),
      instance('wsi_old', { kind: 'unavailable', reason: 'gone' }),
    ],
  },
  wsp_shop: { ...summary('wsp_shop'), instances: [instance('wsi_shop', { kind: 'unknown' })] },
}

function client(list: unknown, describe: (workspace: string) => unknown = w => views[w]) {
  const asked: unknown[] = []
  return {
    asked,
    choices: createWorkspaceChoices({
      list: async body => {
        asked.push(['list', body])
        if (list === 'throw') throw new Error('down')
        return list as never
      },
      describe: async body => {
        asked.push(['describe', body.workspace])
        const view = describe(body.workspace)
        return (
          typeof view === 'string' ? { outcome: view } : { outcome: 'succeeded', body: view }
        ) as never
      },
    }),
  }
}

const listed = {
  outcome: 'succeeded',
  body: { workspaces: [summary('wsp_blog'), summary('wsp_shop')] },
}

describe('the instances a tenant can work in', () => {
  it('lists each instance of each workspace; only an available one can be picked', async () => {
    const { asked, choices } = client(listed)
    expect(await choices.list(TENANT)).toEqual({
      kind: 'listed',
      choices: [
        {
          workspace: 'wsp_blog',
          instance: 'wsi_main',
          label: '/srv/wsi_main',
          selectable: true,
          note: null,
        },
        {
          workspace: 'wsp_blog',
          instance: 'wsi_old',
          label: '/srv/wsi_old',
          selectable: false,
          note: '用不了：这个工作区已经不在了',
        },
        {
          workspace: 'wsp_shop',
          instance: 'wsi_shop',
          label: '/srv/wsi_shop',
          selectable: false,
          note: '现在不知道能不能用',
        },
      ],
    })
    expect(asked).toEqual([
      ['list', { tenant: expect.anything() }],
      ['describe', 'wsp_blog'],
      ['describe', 'wsp_shop'],
    ])
  })

  it('lists nothing when the list or a workspace cannot be read, and says why', async () => {
    expect(await client({ outcome: 'denied' }).choices.list(TENANT)).toEqual({
      kind: 'unavailable',
      reason: '没有权限看工作区',
    })
    expect(await client(listed, () => 'not-found').choices.list(TENANT)).toEqual({
      kind: 'unavailable',
      reason: '没有这个工作区',
    })
    expect(await client({ outcome: 'odd' }).choices.list(TENANT)).toEqual({
      kind: 'unavailable',
      reason: 'odd',
    })
    expect(await client('throw').choices.list(TENANT)).toEqual({
      kind: 'unavailable',
      reason: '没有送达',
    })
  })

  it('asks nothing for a tenant it cannot read', async () => {
    const { asked, choices } = client(listed)
    expect(await choices.list('not a tenant')).toEqual({
      kind: 'unavailable',
      reason: '租户读不懂',
    })
    expect(asked).toEqual([])
  })
})

it('tells those who listen when this client changed the workspaces, until they stop', () => {
  const choices = createWorkspaceChoices({
    list: async () => ({}) as never,
    describe: async () => ({}) as never,
  })
  const heard: string[] = []
  const stop = choices.changed(() => heard.push('one'))
  choices.changed(() => heard.push('two'))
  choices.touch()
  stop()
  choices.touch()
  expect(heard).toEqual(['one', 'two', 'two'])
})
