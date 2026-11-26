import { Context } from '@deepseek-ai/cordis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { tenantScope, type Projection, type ShellLogin } from '@omne-harness/shell-contract'
import type { ShellService } from '@omne-harness/shell-contract/cordis'
import { describe, expect, it, vi } from 'vitest'
import type { LookProjection } from '../src/page/desk/scene.ts'
import { createLookPublisher } from '../src/page/shell/desk/look.ts'
import { shellPlugin } from '../src/page/shell/service.ts'
import { createShellState } from '../src/page/shell/state.ts'
import { ISSUER, SCOPE, harness, lifted, onDesk, type Harness } from './support/desk-stay.ts'

const SOURCE = { module: '/bridge/plugins/sea/1/icons.js', export: 'send' }
const SEA: Projection = {
  css: '@layer omne-changes{:root{--omne-accent:#0a7;}}',
  drawings: [{ point: 'shell.icon', key: 'send', source: SOURCE }],
  unreachable: [],
}
const INK: Projection = { ...SEA, css: '@layer omne-changes{}' }
const copy = (projection: Projection): Projection => structuredClone(projection)
const drawnAs = (more: object): Projection => ({
  ...SEA,
  drawings: [{ ...SEA.drawings[0]!, ...more }],
})

describe('外壳发改动的投影：内容', () => {
  it('第一份是版本 1，带这个外壳的 issuer 与此刻的租户，只带样式文本与出处', () => {
    const device = harness()
    device.project({ ...SEA, unreachable: [{ point: 'shell.icon', key: 'x', by: ['m'] }] })
    expect(device.looks()).toEqual([
      { issuer: ISSUER, version: 1, scope: SCOPE, css: SEA.css, drawings: SEA.drawings },
    ])
  })

  it('没登录时没有 scope', () => {
    const device = harness()
    device.setScope(undefined)
    device.project(SEA)
    expect(device.looks()[0]).not.toHaveProperty('scope')
  })

  it('内容没变：样式文本与每个出处都相同，版本不加，也不发', () => {
    const device = harness()
    device.project(SEA)
    device.project(copy(SEA))
    device.project({ ...copy(SEA), unreachable: [{ point: 'shell.icon', key: 'x', by: ['m'] }] })
    expect(device.looks().map(look => look.version)).toEqual([1])
  })

  it.each([
    ['样式文本', INK],
    ['点', drawnAs({ point: 'shell.piece' })],
    ['键', drawnAs({ key: 'stop' })],
    ['出处的模块', drawnAs({ source: { ...SOURCE, module: '/bridge/plugins/sea/2/icons.js' } })],
    ['出处的导出', drawnAs({ source: { ...SOURCE, export: 'icon' } })],
    ['出处的文件在哪', drawnAs({ source: { ...SOURCE, files: '/bridge/plugins/sea/1/' } })],
    ['少一份画法', { ...SEA, drawings: [] }],
    ['多一份画法', { ...SEA, drawings: [...SEA.drawings, ...drawnAs({ key: 'stop' }).drawings] }],
  ])('内容变了，只有%s不同：版本加一并发；变回去再加一', (_what, other) => {
    const device = harness()
    for (const projection of [SEA, other, copy(other), SEA]) device.project(projection)
    expect(device.looks().map(look => look.version)).toEqual([1, 2, 3])
    expect(device.looks().map(look => look.css)).toEqual([SEA.css, other.css, SEA.css])
    expect(device.looks()[1]?.drawings).toEqual(other.drawings)
  })

  it('只有租户变了也是新的一份：版本加一，带新的租户', () => {
    const device = harness()
    device.project(SEA)
    device.setScope('tenant-b')
    device.project(copy(SEA))
    expect(device.looks().map(look => [look.version, look.scope])).toEqual([
      [1, SCOPE],
      [2, 'tenant-b'],
    ])
  })

  it('还没有一份时什么都不发；一幕的版本是 0', async () => {
    const device = harness()
    await lifted(device)
    expect(device.looks()).toEqual([])
    expect(device.last().look).toMatchObject({ issuer: ISSUER, version: 0 })
  })

  it('issuer 是每个外壳在起来时自己起的一段随机文字', () => {
    const made = () => {
      const sent: LookProjection[] = []
      const publisher = createLookPublisher({
        projection: { get: () => SEA, subscribe: () => () => undefined },
        outside: { warn: () => undefined, navigate: () => undefined },
        told: { show: () => undefined, withdraw: () => undefined },
        scope: () => SCOPE,
        send: look => void sent.push(look),
        changed: () => undefined,
      })
      publisher.dispose()
      return sent[0]!.issuer
    }
    const one = made()
    expect(one).toMatch(/^[0-9a-f-]{36}$/)
    expect(made()).not.toBe(one)
  })
})

describe('发布者收场', () => {
  it('收场之后不再跟着新的投影发', () => {
    const sent: LookProjection[] = []
    const listeners = new Set<(value: Projection | undefined) => void>()
    let now: Projection = SEA
    const publisher = createLookPublisher({
      projection: {
        get: () => now,
        subscribe: listener => {
          listeners.add(listener)
          return () => void listeners.delete(listener)
        },
      },
      outside: { warn: () => undefined, navigate: () => undefined },
      told: { show: () => undefined, withdraw: () => undefined },
      scope: () => SCOPE,
      send: look => void sent.push(look),
      changed: () => undefined,
    })
    now = INK
    for (const listener of listeners) listener(now)
    expect(sent.map(look => look.version)).toEqual([1, 2])
    publisher.dispose()
    now = SEA
    for (const listener of listeners) listener(now)
    expect(listeners.size).toBe(0)
    expect(sent.map(look => look.version)).toEqual([1, 2])
  })
})

describe('外壳发改动的投影：时机', () => {
  it('有了新的一份，没有租约也发；不发一幕', () => {
    const device = harness()
    device.project(SEA)
    expect(device.kinds()).toEqual(['look'])
  })

  it('有了新的一份，有租约：先发投影，再发带着新版本的一幕', async () => {
    const device = harness()
    device.project(SEA)
    await lifted(device)
    const before = device.posted.length
    device.project(INK)
    expect(device.kinds().slice(before)).toEqual(['look', 'scene'])
    expect(device.last().look).toMatchObject({ issuer: ISSUER, version: 2 })
  })

  it('内容没变，有租约：投影与一幕都不发', async () => {
    const device = harness()
    device.project(SEA)
    await lifted(device)
    const before = device.posted.length
    device.project(copy(SEA))
    expect(device.kinds().slice(before)).toEqual([])
  })

  it('只有租户变了，有租约：先发投影，再发一幕', async () => {
    const device = harness()
    device.project(SEA)
    await lifted(device)
    const before = device.posted.length
    device.setScope('tenant-b')
    device.project(copy(SEA))
    expect(device.kinds().slice(before)).toEqual(['look', 'scene'])
    expect(device.last().look).toMatchObject({ version: 2 })
  })

  it('开了租约：发第一幕之前发最新的一份，一幕带着它的 issuer 与版本', async () => {
    const device = harness()
    device.project(SEA)
    device.project(INK)
    const before = device.posted.length
    await lifted(device)
    expect(device.kinds().slice(before)).toEqual(['look', 'scene'])
    expect(device.looks().at(-1)).toMatchObject({ issuer: ISSUER, version: 2, css: INK.css })
    expect(device.last()).toMatchObject({ serial: 1, look: { issuer: ISSUER, version: 2 } })
  })

  it('报到：重发一幕之前发最新的一份', async () => {
    const device = harness()
    device.project(SEA)
    await onDesk(device)
    const before = device.posted.length
    device.up({ kind: 'hello' })
    expect(device.kinds().slice(before)).toEqual(['look', 'scene'])
    expect(device.looks().at(-1)).toMatchObject({ version: 1 })
  })

  it('报到，没有租约：发最新的一份，不发一幕', () => {
    const device = harness()
    device.project(SEA)
    const before = device.posted.length
    device.up({ kind: 'hello' })
    expect(device.kinds().slice(before)).toEqual(['look'])
  })
})

const ALICE = '{"organization":"org_1","account":"acc_alice"}'
const login: ShellLogin = {
  state: () => 'signed-in',
  subscribe: () => () => undefined,
  login: async () => 'signed-in',
  logout: async () => 'signed-out',
}

async function shellRoot() {
  const root = new Context()
  const warned = vi.spyOn(root.logger, 'warn').mockImplementation(() => undefined)
  const state = createShellState(login, { knowsToken: name => name === '--omne-accent' })
  await root.plugin(DynamisService)
  await root.plugin(shellPlugin(state))
  state.scope.set(ALICE)
  let shell: ShellService | undefined
  await root.plugin({ name: 'brand', inject: ['shell'], apply: ctx => void (shell = ctx.shell) })
  const lines = () => warned.mock.calls.map(([text]) => String(text))
  return { state, shell: shell!, lines }
}

describe('外壳算投影', () => {
  it('每次重算改动都做一份：样式文本就是改动的，画法是 shell.icon 与 shell.piece 上算数而有出处的', async () => {
    const { state, shell } = await shellRoot()
    shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, tenantScope(ALICE))
    shell.putDrawing('shell.icon', 'send', () => null, tenantScope(ALICE), SOURCE)
    shell.putDrawing('shell.piece', 'figure', () => null, tenantScope(ALICE), {
      ...SOURCE,
      export: 'figure',
    })
    await new Promise(done => setTimeout(done, 0))
    const projection = state.projection.get()
    expect(projection?.css).toBe(state.sheet.get())
    expect(projection?.drawings.map(each => [each.point, each.key, each.source.export])).toEqual([
      ['shell.icon', 'send', 'send'],
      ['shell.piece', 'figure', 'figure'],
    ])
  })

  it('算数而没有出处的画法各记一条警告，写明点、键与谁放的；同一项只记一次', async () => {
    const { shell, lines } = await shellRoot()
    shell.putDrawing('shell.icon', 'send', () => null, tenantScope(ALICE))
    await new Promise(done => setTimeout(done, 0))
    shell.putTokens('shell.app', { '--omne-accent': '#0a7' }, tenantScope(ALICE))
    await new Promise(done => setTimeout(done, 0))
    const about = lines().filter(line => line.includes('shell.icon send'))
    expect(about).toHaveLength(1)
    expect(about[0]).toMatch(/^shell: shell\.icon send put by brand /)
  })
})

const up = (device: Harness, message: object) => device.up({ issuer: ISSUER, ...message })
const TOAST = { id: 't-1', tone: 'info', title: '画好了' } as const
const UNDRAWN = {
  kind: 'undrawn',
  point: 'shell.icon',
  key: 'send',
  module: SOURCE.module,
  export: 'send',
  reason: 'the export is not a function',
}

describe('桌面层的上行：没得到画法', () => {
  it('issuer 是这个外壳的：记一条警告，写明文件、导出与原因；租户对不对都记', () => {
    const device = harness()
    up(device, { ...UNDRAWN, scope: SCOPE })
    up(device, { ...UNDRAWN, scope: 'tenant-b', reason: 'send threw: no' })
    expect(device.warned).toHaveLength(2)
    for (const line of device.warned) {
      expect(line).toContain(SOURCE.module)
      expect(line).toContain('send')
    }
    expect(device.warned[0]).toContain('the export is not a function')
    expect(device.warned[1]).toContain('send threw: no')
  })

  it('同一条只记一次；每样文字压成一行、有上界；记过 64 条不同的之后不再记', () => {
    const device = harness()
    up(device, { ...UNDRAWN, scope: SCOPE })
    up(device, { ...UNDRAWN, scope: SCOPE })
    expect(device.warned).toHaveLength(1)
    expect(device.warned[0]).toBe(
      `the desk got no drawing for shell.icon send from ${SOURCE.module}, export send: the export is not a function`,
    )
    up(device, { ...UNDRAWN, reason: `x\n\tshell:  forged line ${'a'.repeat(100_000)}` })
    expect(device.warned).toHaveLength(2)
    const clipped = `x shell: forged line ${'a'.repeat(240)}`.slice(0, 240)
    expect(device.warned[1]).toBe(
      `the desk got no drawing for shell.icon send from ${SOURCE.module}, export send: ${clipped}…`,
    )
    up(device, { ...UNDRAWN, reason: 'b'.repeat(240) })
    expect(device.warned[2]?.endsWith(`: ${'b'.repeat(240)}`)).toBe(true)
    for (let index = 0; index < 100; index += 1) up(device, { ...UNDRAWN, reason: `r${index}` })
    expect(device.warned).toHaveLength(64)
    expect(device.warned.at(-1)).toContain(': r60')
  })

  it('issuer 不是这个外壳的：不理', () => {
    const device = harness()
    up(device, { ...UNDRAWN, scope: SCOPE, issuer: 'shell-0' })
    up(device, { ...UNDRAWN, scope: 'tenant-b', issuer: 'shell-0' })
    expect(device.warned).toEqual([])
  })
})

describe('桌面层的上行：切页与提示', () => {
  const cells = [
    { issuer: ISSUER, scope: SCOPE, done: true },
    { issuer: ISSUER, scope: 'tenant-b', done: false },
    { issuer: 'shell-0', scope: SCOPE, done: false },
    { issuer: 'shell-0', scope: 'tenant-b', done: false },
  ]

  for (const { issuer, scope, done } of cells)
    it(`切页：issuer ${issuer === ISSUER ? '对' : '不对'}、租户${scope === SCOPE ? '对' : '不对'}，${done ? '办' : '不理'}`, () => {
      const device = harness()
      device.up({ kind: 'navigate', issuer, scope, page: 'chat', subject: 'session-1' })
      expect(device.navigated).toEqual(done ? [['chat', 'session-1']] : [])
    })

  for (const { issuer, scope, done } of cells)
    it(`提示：issuer ${issuer === ISSUER ? '对' : '不对'}、租户${scope === SCOPE ? '对' : '不对'}，${done ? '办' : '不理'}`, () => {
      const device = harness()
      device.up({ kind: 'toast', issuer, scope, toast: TOAST })
      expect(device.told.said()?.toast).toEqual(done ? TOAST : undefined)
    })

  it('没登录时切页与提示都不理', () => {
    const device = harness()
    device.setScope(undefined)
    up(device, { kind: 'navigate', scope: SCOPE, page: 'chat' })
    up(device, { kind: 'toast', scope: SCOPE, toast: TOAST })
    expect(device.navigated).toEqual([])
    expect(device.told.said()).toBeUndefined()
  })
})

describe('桌面层来的提示什么时候撤掉', () => {
  it('换上一份租户不同的投影时撤掉；租户相同的新一份不撤', () => {
    const device = harness()
    device.project(SEA)
    up(device, { kind: 'toast', scope: SCOPE, toast: TOAST })
    device.project(INK)
    expect(device.told.said()?.toast).toEqual(TOAST)
    device.setScope('tenant-b')
    device.project(INK)
    expect(device.told.said()).toBeUndefined()
  })

  it('租约结束时撤掉', async () => {
    const device = harness()
    await onDesk(device)
    up(device, { kind: 'toast', scope: SCOPE, toast: TOAST })
    expect(device.told.said()?.toast).toEqual(TOAST)
    device.line(0, { ended: true })
    await device.settle()
    expect(device.told.said()).toBeUndefined()
  })

  it('外壳自己放弃租约时也撤掉', async () => {
    const device = harness()
    await onDesk(device)
    device.stay.recall()
    const home = device.last()
    device.up({ kind: 'arrived', lease: home.lease, serial: home.serial })
    up(device, { kind: 'toast', scope: SCOPE, toast: TOAST })
    const empty = device.last()
    device.up({ kind: 'cleared', lease: empty.lease, serial: empty.serial })
    expect(device.told.said()).toBeUndefined()
  })

  it('别人放的提示不因租约结束撤掉', async () => {
    const device = harness()
    await onDesk(device)
    device.told.show({}, TOAST)
    device.line(0, { ended: true })
    await device.settle()
    expect(device.told.said()?.toast).toEqual(TOAST)
  })
})
