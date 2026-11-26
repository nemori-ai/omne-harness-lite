import { describe, expect, it } from 'vitest'
import { DEVICE_PAGE_VERSION, DEVICE_PAGE_VERSION_TOLD } from '../src/shared/page-version.ts'
import type { Mount } from '../src/main/page-trial.ts'
import { installRequest, pageUpdates } from '../src/main/page-update.ts'
import type { Installed, PageVersions, Serving } from '../src/main/page-versions.ts'

const config = { fallLimit: 3, backoffBaseMs: 250, backoffMaxMs: 2000 }
const BUILTIN: Serving = { version: 'builtin', root: '/app/page', settled: true }
const log = { debug() {}, info() {}, warn() {}, error() {} }

type World = Readonly<{
  installed?: Installed
  installFails?: Error | string
  candidate?: Mount
  mounts?: readonly Mount[]
  stable?: boolean
}>

function world(input: World, started: Serving = BUILTIN) {
  const did: string[] = []
  const mounts = [...(input.mounts ?? ['mounted'])]
  let pointer = { current: started.version, previous: 'builtin', settled: true }
  const versions: PageVersions = {
    serving: async () => started,
    rootOf: version => (version === 'builtin' ? '/app/page' : `/user/versions/${version}`),
    install: async () => {
      if (input.installFails !== undefined) throw input.installFails
      return input.installed ?? { kind: 'installed', version: 'page-2' }
    },
    switchTo(version) {
      did.push(`switch ${version}`)
      pointer = { current: version, previous: 'builtin', settled: false }
      return { outcome: 'moved', pointer }
    },
    tell(version, kind) {
      did.push(`${kind} ${version}`)
      if (kind === 'settled') pointer = { current: version, previous: version, settled: true }
      else pointer = { current: 'builtin', previous: 'builtin', settled: true }
      return { outcome: kind === 'settled' ? 'moved' : 'rolled-back', pointer }
    },
  }
  const updates = pageUpdates(
    {
      versions,
      serve: async serving => void did.push(`serve ${serving.version} ${serving.root}`),
      nudge: () => void did.push('nudge'),
      candidate: async root => {
        did.push(`candidate ${root}`)
        return input.candidate ?? 'mounted'
      },
      window: {
        watch: async () => mounts.shift() ?? 'not-mounted',
        stable: async () => input.stable ?? true,
        reload: () => void did.push('reload'),
        after: async () => undefined,
      },
      config,
      log,
    },
    started,
  )
  const asked = async (): Promise<unknown> => {
    const answer = await updates.route(new Request(`omne-app://app${DEVICE_PAGE_VERSION}`))
    return answer?.json()
  }
  const settle = async (): Promise<void> => {
    for (let turn = 0; turn < 50; turn += 1) await Promise.resolve()
  }
  return { updates, did, asked, settle }
}

describe('换一版页面', () => {
  it('装上、试起、切过去、试用到起稳：按这个次序，并告诉人换到了哪一版', async () => {
    const w = world({})
    await w.updates.install('/downloads/bundle')
    await w.settle()
    expect(w.did).toEqual([
      'candidate /user/versions/page-2',
      'switch page-2',
      'serve page-2 /user/versions/page-2',
      'nudge',
      'settled page-2',
    ])
    expect(await w.asked()).toEqual({
      version: 'page-2',
      notice: { kind: 'switched', to: 'page-2' },
    })
    expect(w.updates.onTrial()).toBe(false)
  })

  it('来源核不过：不试起、不切，现在的一版照常，写明原因', async () => {
    const w = world({ installed: { kind: 'refused', reason: 'signature-invalid', detail: 'x' } })
    await w.updates.install('/downloads/bundle')
    expect(w.did).toEqual(['nudge'])
    expect(await w.asked()).toEqual({
      version: 'builtin',
      notice: { kind: 'refused', reason: 'signature-invalid' },
    })
  })

  it('装的时候出了错：不切，把错写给人；之后再来的照接', async () => {
    const w = world({ installFails: new Error('no space left on the disk') })
    await w.updates.install('/downloads/bundle')
    expect(w.did).toEqual(['nudge'])
    expect(await w.asked()).toEqual({
      version: 'builtin',
      notice: { kind: 'refused', reason: 'no space left on the disk' },
    })
    const text = world({ installFails: 'not an error object' })
    await text.updates.install('/downloads/bundle')
    await text.updates.install('/downloads/bundle')
    expect(text.did).toEqual(['nudge', 'nudge'])
    expect(await text.asked()).toEqual({
      version: 'builtin',
      notice: { kind: 'refused', reason: 'not an error object' },
    })
  })

  it('试起的时候没有渲染出来：不切，写明是哪一版、为什么', async () => {
    const w = world({ candidate: 'not-mounted' })
    await w.updates.install('/downloads/bundle')
    expect(w.did).toEqual(['candidate /user/versions/page-2', 'nudge'])
    expect(await w.asked()).toEqual({
      version: 'builtin',
      notice: { kind: 'refused', reason: 'not-mounted', version: 'page-2' },
    })
  })

  it('切过去之后连着三次没起来：退回上一版并重新服务它，告诉人从哪一版退回了哪一版', async () => {
    const w = world({ mounts: ['not-mounted', 'renderer-gone', 'load-failed'] })
    await w.updates.install('/downloads/bundle')
    await w.settle()
    expect(w.did).toEqual([
      'candidate /user/versions/page-2',
      'switch page-2',
      'serve page-2 /user/versions/page-2',
      'nudge',
      'reload',
      'reload',
      'fell-to-limit page-2',
      'serve builtin /app/page',
      'nudge',
    ])
    expect(await w.asked()).toEqual({
      version: 'builtin',
      notice: { kind: 'fell', from: 'page-2', to: 'builtin', falls: 3 },
    })
  })

  it('试用中由它答主窗口的失败；装的就是现在这一版时什么都不做', async () => {
    const w = world({
      mounts: [],
      stable: false,
      installed: { kind: 'installed', version: 'builtin' },
    })
    await w.updates.install('/downloads/bundle')
    expect(w.did).toEqual([])
    const trying = world({ mounts: ['not-mounted'] })
    const installing = trying.updates.install('/downloads/bundle')
    await installing
    expect(trying.updates.onTrial()).toBe(true)
    await trying.settle()
  })

  it('启动时指针指着的一版用不了：告诉人这一次用的是自带的那一版；人看过之后不再说', async () => {
    const unusable = { ...BUILTIN, unusable: { version: 'page-9', reason: 'digest-mismatch' } }
    const w = world({}, unusable)
    const notice = { kind: 'unusable', from: 'page-9', reason: 'digest-mismatch' }
    expect(await w.asked()).toEqual({ version: 'builtin', notice })
    const told = new Request(`omne-app://app${DEVICE_PAGE_VERSION_TOLD}`, { method: 'POST' })
    expect((await w.updates.route(told))?.status).toBe(204)
    expect(await w.asked()).toEqual({ version: 'builtin', notice: null })
    expect(w.updates.route(new Request('omne-app://app/device/figure'))).toBeUndefined()
  })

  it('一次装还没完又来一次、或有一版在试用中：后来的不接；这一次完了之后再来的照接', async () => {
    let release: (mount: Mount) => void = () => undefined
    const held = new Promise<Mount>(resolve => (release = resolve))
    const w = world({ mounts: [] })
    const candidates: string[] = []
    const updates = pageUpdates(
      {
        versions: {
          serving: async () => BUILTIN,
          rootOf: version => `/user/versions/${version}`,
          install: async directory => ({ kind: 'installed', version: directory.slice(1) }),
          switchTo: version => ({
            outcome: 'moved',
            pointer: { current: version, previous: 'builtin', settled: false },
          }),
          tell: version => ({
            outcome: 'moved',
            pointer: { current: version, previous: version, settled: true },
          }),
        },
        serve: async () => undefined,
        nudge: () => undefined,
        candidate: root => {
          candidates.push(root)
          return candidates.length === 1 ? held : Promise.resolve('not-mounted')
        },
        window: {
          watch: async () => 'mounted',
          stable: async () => true,
          reload() {},
          after: async () => undefined,
        },
        config,
        log,
      },
      BUILTIN,
    )
    const first = updates.install('/one')
    await w.settle()
    await updates.install('/two')
    expect(candidates).toEqual(['/user/versions/one'])
    release('not-mounted')
    await first
    await updates.install('/three')
    expect(candidates).toEqual(['/user/versions/one', '/user/versions/three'])
  })

  it('答复是不许缓存的 JSON；别的方法与别的地址不归它答', async () => {
    const w = world({})
    const answer = await w.updates.route(new Request(`omne-app://app${DEVICE_PAGE_VERSION}`))
    expect(answer?.headers.get('content-type')).toBe('application/json')
    expect(answer?.headers.get('cache-control')).toBe('no-store')
    const post = (path: string) => new Request(`omne-app://app${path}`, { method: 'POST' })
    expect(w.updates.route(post(DEVICE_PAGE_VERSION))).toBeUndefined()
    expect(w.updates.route(post('/device/other'))).toBeUndefined()
    expect(
      w.updates.route(new Request(`omne-app://app${DEVICE_PAGE_VERSION_TOLD}`)),
    ).toBeUndefined()
  })

  it('启动时在服务的一版已经定下：不试用', async () => {
    const w = world({})
    w.updates.resume()
    await w.settle()
    expect(w.did).toEqual([])
    expect(w.updates.onTrial()).toBe(false)
  })

  it('启动时在服务的一版还没起稳：接着试用', async () => {
    const w = world({}, { version: 'page-2', root: '/user/versions/page-2', settled: false })
    w.updates.resume()
    await w.settle()
    expect(w.did).toEqual(['settled page-2'])
  })
})

describe('命令行上的装', () => {
  it('认 --install-page-bundle=<目录>；没有或是空的就不装', () => {
    expect(installRequest(['app', '--install-page-bundle=/a b/bundle'])).toBe('/a b/bundle')
    expect(installRequest(['app', '--install-page-bundle='])).toBeUndefined()
    expect(installRequest(['app', '--other'])).toBeUndefined()
  })
})
