import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import type { Member } from '@omne-harness/plugin-protocol'
import { installOn, type Listed } from '@omne-harness/plugin-ui'
import {
  LAYOUT_POINT,
  STYLE_POINT,
  TOKENS_POINT,
  changesOn,
  definePart,
  tenantScope,
} from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { ReferenceShell, startShellOf } from '@omne-harness/shell-contract/testing'

const ALICE =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'
const BOB =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000002"}'
const KNOWN = new Set(['--omne-accent'])

class Framed extends ReferenceShell {
  constructor(ctx: Context) {
    super(ctx)
    this.tenant = ALICE
    this.declareOwn([
      { name: 'shell.app', label: '整个应用', summary: '窗口里的一切', depths: ['tokens'] },
    ])
  }

  protected override knowsToken(name: string): boolean {
    return KNOWN.has(name)
  }
}

const send = definePart({
  name: 'notes.send',
  label: '发送按钮',
  summary: '把写好的一条发出去',
  depths: ['style'],
})

async function world() {
  const started = await startShellOf(Framed)
  let inside: ShellService | undefined
  await started.root.plugin({
    name: 'notes-ui',
    inject: ['shell'],
    apply: (ctx: Context) => send.declare(ctx.shell),
  })
  await started.root.plugin({
    name: 'loader',
    inject: ['shell'],
    apply(ctx: Context) {
      inside = ctx.shell
    },
  })
  const shell = inside!
  const standing = (asker = ALICE) =>
    changesOn(started.shell.registry(), tenantScope(asker), name => KNOWN.has(name))
      .standing.filter(each => !each.builtIn)
      .map(each => `${each.point} ${each.key} by ${each.by.join('+')}`)
  const install = (listed: Listed) => installOn(shell, listed, tenantScope(ALICE))
  return { shell, standing, install }
}

const red: Member = { point: STYLE_POINT, key: 'notes.send', data: { base: { color: 'red' } } }
const accent: Member = { point: TOKENS_POINT, key: 'shell.app', data: { '--omne-accent': 'teal' } }
const pages: Member = { point: LAYOUT_POINT, key: 'shell.pages', data: ['b', 'a'] }
const brand = (...members: Member[]): Listed => ({ name: 'brand', version: 'v1', members })

async function failure(listed: Listed): Promise<string> {
  const t = await world()
  const outcome = await t.install(listed)
  expect(t.standing()).toEqual([])
  if (outcome.kind !== 'failed') throw new Error(`it was ${outcome.kind}`)
  return outcome.reason
}

describe('putting the members of one plugin on the points', () => {
  it('puts each member as one item, under the name of the plugin and its version, and no more than the members', async () => {
    const t = await world()
    const outcome = await t.install(brand(red, accent, pages))
    expect(outcome.kind).toBe('installed')
    expect(t.standing()).toEqual([
      `${TOKENS_POINT} shell.app by plugin:brand@v1`,
      `${STYLE_POINT} notes.send by plugin:brand@v1`,
      `${LAYOUT_POINT} shell.pages by plugin:brand@v1`,
    ])
    const changes = t.shell.changes()
    expect(changes.app).toEqual({ '--omne-accent': 'teal' })
    expect(changes.css).toContain('[data-omne-part="notes.send"]{color:red;}')
    expect(changes.layouts).toEqual({ 'shell.pages': ['b', 'a'] })
  })

  it('puts them in the scope it is given: another tenant, and nobody signed in, do not see them', async () => {
    const t = await world()
    await t.install(brand(red))
    expect(t.standing(BOB)).toEqual([])
    expect(t.standing('')).toEqual([])
  })

  it('takes all of it away again', async () => {
    const t = await world()
    const outcome = await t.install(brand(red, accent))
    if (outcome.kind !== 'installed') throw new Error(outcome.kind)
    await outcome.remove()
    expect(t.standing()).toEqual([])
    expect(t.shell.changes().app).toEqual({})
  })

  it('fails as a whole when the rules of a point do not take one member, and says which and why', async () => {
    const nowhere: Member = { ...red, key: 'notes.nowhere' }
    expect(await failure(brand(red, nowhere))).toBe(
      `${STYLE_POINT} notes.nowhere: no part is declared as notes.nowhere`,
    )
  })

  it.each([
    [
      'a point that takes no data from a plugin',
      { point: 'session.tool-call', key: 'web', data: {} },
      'member 2 (session.tool-call web): the point takes no data from a plugin',
    ],
    [
      'tokens that are not a record',
      { point: TOKENS_POINT, key: 'shell.sidebar', data: ['--omne-accent'] },
      `member 2 (${TOKENS_POINT} shell.sidebar): the data is not a record of names and values`,
    ],
    [
      'tokens that are nothing',
      { point: TOKENS_POINT, key: 'shell.sidebar', data: null },
      `member 2 (${TOKENS_POINT} shell.sidebar): the data is not a record of names and values`,
    ],
    [
      'code',
      { point: 'shell.part-render', key: 'notes.send', module: 'send.js', export: 'send' },
      'member 2 (shell.part-render notes.send): this application loads no code',
    ],
    [
      'a style that is not a record',
      { point: STYLE_POINT, key: 'notes.send', data: 'red' },
      `member 2 (${STYLE_POINT} notes.send): the data is not a record of states and declarations`,
    ],
    [
      'an order that is not a list',
      { point: LAYOUT_POINT, key: 'shell.pages', data: { first: 'a' } },
      `member 2 (${LAYOUT_POINT} shell.pages): the data is not a list of ids`,
    ],
    [
      'an id on a point that holds one item for a key',
      { ...red, id: 'mine' },
      `member 2 (${STYLE_POINT} notes.send): the point holds one item for a key, so a member writes no id and no rank`,
    ],
    [
      'a rank on a point that holds one item for a key',
      { ...red, rank: 3 },
      `member 2 (${STYLE_POINT} notes.send): the point holds one item for a key, so a member writes no id and no rank`,
    ],
    [
      'a directory',
      { point: 'skill.skills', key: 'notes', directory: 'skills/notes' },
      'member 2 (skill.skills notes): this side takes no directory',
    ],
  ] as const)('puts nothing when a member is %s', async (_name, member, reason) => {
    expect(await failure(brand(accent, member))).toBe(reason)
  })

  it('fails as a whole when two members name one place', async () => {
    const blue: Member = { ...red, data: { base: { color: 'blue' } } }
    expect(await failure(brand(red, blue))).toBe(
      `member 2 (${STYLE_POINT} notes.send): another member of this plugin is at the same place`,
    )
  })

  it('fails, with the reason, when the scope of the plugin cannot be opened', async () => {
    const t = await world()
    const closed = Object.create(t.shell) as typeof t.shell
    closed.host = () => Promise.reject(new Error('the module has left'))
    expect(await installOn(closed, brand(red), tenantScope(ALICE))).toEqual({
      kind: 'failed',
      reason: 'the module has left',
    })
    expect(t.standing()).toEqual([])
  })

  it('does not load what the list says cannot be loaded as listed', async () => {
    expect(await failure({ ...brand(red), fault: 'the manifest is not JSON' })).toBe(
      'the manifest is not JSON',
    )
  })

  it('keeps two generations apart: each is named after its own version', async () => {
    const t = await world()
    const first = await t.install(brand(accent))
    const second = await t.install({ ...brand(accent), version: 'v2' })
    expect(second.kind).toBe('installed')
    expect(t.standing()).toEqual([`${TOKENS_POINT} shell.app by plugin:brand@v1+plugin:brand@v2`])
    if (first.kind === 'installed') await first.remove()
    expect(t.standing()).toEqual([`${TOKENS_POINT} shell.app by plugin:brand@v2`])
  })
})
