import type { Context } from '@deepseek-ai/cordis'
import { tenantScope } from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { ReferenceShell, render, startShellOf } from '@omne-harness/shell-contract/testing'
import { describe, expect, it } from 'vitest'

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const BOB =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'

class Signing extends ReferenceShell {
  signIn(tenant: string | undefined): void {
    this.tenant = tenant
    this.rescope()
  }
}

const page = (id: string, title = id, order = 0) => ({ id, title, order, icon: 'topics', render })
const back = (id: string) => ({ id, render })

async function world() {
  const started = await startShellOf(Signing)
  let inside: ShellService | undefined
  await started.root.plugin({
    name: 'app-ui',
    inject: ['shell'],
    apply(ctx: Context) {
      ctx.shell.contribute('pages', page('conversation', 'Conversation'))
      ctx.shell.contribute('pages', page('assets', 'Assets', 9), { lock: true })
      ctx.shell.contribute('back', back('canvas'))
      inside = ctx.shell
    },
  })
  const shell = inside!
  const as = (tenant: string | undefined) => {
    started.shell.signIn(tenant)
    return started.shell.items('pages').map(item => item.title)
  }
  const plugin = (name: string, tenant: string, put: (shell: ShellService) => void) =>
    shell.host(name, put, tenantScope(tenant))
  return { ...started, shell, as, plugin }
}

describe('the places of the shell are read as the tenant signed in now (FE-I73)', () => {
  it('two tenants each put a page: each sees only their own, nobody signed in sees neither, and a switch of tenant takes it away at once', async () => {
    const t = await world()
    await t.plugin('plugin:weather', ALICE, shell =>
      shell.contribute('pages', page('weather', 'Weather')),
    )
    await t.plugin('plugin:notes', BOB, shell => shell.contribute('pages', page('notes', 'Notes')))
    expect(t.as(ALICE)).toEqual(['Conversation', 'Weather', 'Assets'])
    expect(t.as(BOB)).toEqual(['Conversation', 'Notes', 'Assets'])
    expect(t.as(undefined)).toEqual(['Conversation', 'Assets'])
  })

  it('a list place: a page of the tenant with the id of a built-in one takes its place, and other ids stand beside it', async () => {
    const t = await world()
    await t.plugin('plugin:chat', ALICE, shell => {
      shell.contribute('pages', page('conversation', 'Chat'))
      shell.contribute('pages', page('weather', 'Weather'))
    })
    expect(t.as(ALICE)).toEqual(['Chat', 'Weather', 'Assets'])
    expect(t.as(BOB)).toEqual(['Conversation', 'Assets'])
  })

  it('a locked item of the release is not taken by a page of the tenant with its id: the plugin is told it is locked', async () => {
    const t = await world()
    const hosted = await t.plugin('plugin:own-assets', ALICE, shell =>
      shell.contribute('pages', page('assets', 'Mine')),
    )
    expect(t.as(ALICE)).toEqual(['Conversation', 'Assets'])
    expect(hosted.effects().map(effect => effect.state)).toEqual(['locked'])
  })

  it('a place of one: the item of the tenant takes the place of the built-in one, and two of one tenant are a conflict', async () => {
    const t = await world()
    t.as(ALICE)
    expect(t.shell.items('back').map(item => item.id)).toEqual(['canvas'])
    const first = await t.plugin('plugin:sea', ALICE, shell =>
      shell.contribute('back', back('sea')),
    )
    expect(t.shell.items('back').map(item => item.id)).toEqual(['sea'])
    t.as(BOB)
    expect(t.shell.items('back').map(item => item.id)).toEqual(['canvas'])
    await t.plugin('plugin:sky', ALICE, shell => shell.contribute('back', back('sky')))
    t.as(ALICE)
    expect(t.shell.items('back')).toEqual([])
    expect(t.shell.conflicts('back').map(conflict => conflict.by.length)).toEqual([2])
    await first.dispose()
    t.as(ALICE)
    expect(t.shell.items('back').map(item => item.id)).toEqual(['sky'])
  })

  it('the login gate takes nothing of a tenant: its receipt is closed', async () => {
    const t = await world()
    const hosted = await t.plugin('plugin:gate', ALICE, shell =>
      shell.contribute('gate', { id: 'mine', render }),
    )
    expect(hosted.effects().map(effect => effect.state)).toEqual(['closed'])
  })
})
