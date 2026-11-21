import { describe, expect, it } from 'vitest'
import {
  originRef,
  type FacilityRequest,
  type ScreenFacility,
} from '@omne-harness/execution-environment-contract'
import {
  runConformanceCase,
  screenFacilityConformance,
  scriptedScreenPng,
} from '@omne-harness/execution-environment-contract/testing'
import type { Monitor, ScreenBackend, ScreenPermission, Shot } from '@omne-harness/screen'
import { createHostFilesDomain } from '../src/host-domain.ts'
import { createHostFilesProvider } from '../src/host-provider.ts'
import { createScreenFacility, offeredScreen } from '../src/host-screen.ts'

const LEFT: Monitor = {
  id: 'left',
  name: 'Built-in',
  primary: true,
  pixels: { width: 64, height: 40 },
  scale: 2,
  origin: { x: 0, y: 0 },
}
const RIGHT: Monitor = {
  id: 'right',
  name: 'External',
  primary: false,
  pixels: { width: 48, height: 48 },
  scale: 1,
  origin: { x: 32, y: 0 },
}

/** A backend over fixed screens: what it is asked is recorded, and each answer can be replaced. */
function backendOf(monitors: readonly Monitor[] = [LEFT, RIGHT]) {
  const state = { permission: 'satisfied' as ScreenPermission, captures: 0, lists: 0 }
  const shot = (width: number, height: number): Shot => ({
    png: scriptedScreenPng(width, height),
    width,
    height,
  })
  const backend: ScreenBackend = {
    name: 'fixture',
    verification: 'contract-suite',
    permission: async () => state.permission,
    list: async () => {
      state.lists += 1
      return monitors
    },
    capture: async ({ screen, region }) => {
      state.captures += 1
      const monitor = monitors.find(each => each.id === screen)
      if (monitor === undefined) return 'not-found'
      const size = region ?? monitor.pixels
      return shot(size.width, size.height)
    },
  }
  return { backend, state, shot }
}

let sequence = 0
const request = (binding: FacilityRequest<unknown>['binding'] = { kind: 'host_machine' }) => ({
  requestId: `request-${String(++sequence)}`,
  access: { principal: 'someone', tenant: 'tenant' as never },
  origin: originRef('test'),
  binding,
})
const capture = (facility: ScreenFacility<unknown>, screen: string | null = null) =>
  facility.capture({ ...request(), screen, region: null })

describe('the screen facility of the host over a backend (EX-16)', () => {
  for (const test of screenFacilityConformance({
    subject() {
      const { backend, state } = backendOf()
      return {
        facility: createScreenFacility(backend),
        request,
        control: {
          revoke() {
            state.permission = 'unsatisfied'
          },
        },
      }
    },
  }))
    it(test.name, async () => {
      expect(await runConformanceCase(test)).toEqual({ name: test.name, status: 'pass' })
    })

  it('answers each request by its own identity, and a frame carries the instant it was taken', async () => {
    const facility = createScreenFacility(backendOf().backend)
    const asked = request()
    const before = Date.now()
    const answer = await facility.capture({ ...asked, screen: 'right', region: null })
    expect(answer).toMatchObject({ kind: 'done', requestId: asked.requestId })
    if (answer.kind !== 'done') return
    expect(answer.value.screen).toEqual(RIGHT)
    expect(Date.parse(answer.value.takenAt)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(answer.value.takenAt)).toBeLessThanOrEqual(Date.now())
  })

  it('refuses a binding that is not the host machine, without asking the backend', async () => {
    const { backend, state } = backendOf()
    const facility = createScreenFacility(backend)
    const elsewhere = request({ kind: 'container' } as never)
    expect(await facility.list(elsewhere)).toEqual({
      kind: 'rejected',
      requestId: elsewhere.requestId,
      reason: 'unsupported',
    })
    expect(await facility.capture({ ...elsewhere, screen: null, region: null })).toMatchObject({
      kind: 'rejected',
      reason: 'unsupported',
    })
    expect(state).toMatchObject({ lists: 0, captures: 0 })
  })

  it('a permission that cannot be read is unavailable, not satisfied; one that is refused is not authorized', async () => {
    const { backend, state } = backendOf()
    const facility = createScreenFacility(backend)
    state.permission = 'unknown'
    expect(await facility.list(request())).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
    expect(await capture(facility)).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    state.permission = 'unsatisfied'
    expect(await capture(facility)).toMatchObject({ kind: 'rejected', reason: 'notAuthorized' })
    expect(state.captures).toBe(0)
    state.permission = 'satisfied'
    expect(await capture(facility)).toMatchObject({ kind: 'done' })
  })

  it('answers unknown when the backend throws: nothing changed, asking again is safe', async () => {
    const { backend } = backendOf()
    const asked = request()
    let lists = 0
    const broken: ScreenBackend = {
      ...backend,
      list: () => (++lists > 1 ? Promise.reject(new Error('gone')) : backend.list()),
    }
    expect(await createScreenFacility(broken).list(asked)).toEqual({
      kind: 'unknown',
      requestId: asked.requestId,
    })
    let calls = 0
    const failing: ScreenBackend = {
      ...backend,
      capture: input => (++calls > 1 ? Promise.reject(new Error('gone')) : backend.capture(input)),
    }
    expect(await capture(createScreenFacility(failing), 'right')).toMatchObject({ kind: 'unknown' })
  })
})

describe('the backend checks itself with one frame before the facility hands any out', () => {
  it('checks once, when the permission is first there, and not while it is not', async () => {
    const { backend, state } = backendOf()
    const facility = createScreenFacility(backend)
    state.permission = 'unsatisfied'
    await capture(facility)
    expect(state.captures).toBe(0)
    state.permission = 'satisfied'
    await facility.list(request())
    expect(state.captures).toBe(1)
    await capture(facility)
    await capture(facility, 'right')
    expect(state.captures).toBe(3)
  })

  it('a backend whose frame is not the size it lists hands out nothing, at this request and later', async () => {
    const { backend, state, shot } = backendOf()
    const wrong: ScreenBackend = { ...backend, capture: async () => shot(128, 80) }
    const facility = createScreenFacility(wrong)
    for (const answer of [
      await facility.list(request()),
      await capture(facility),
      await facility.list(request()),
    ])
      expect(answer).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    expect(state.captures).toBe(0)
  })

  it('a check that could not be done is done again at the next request', async () => {
    const { backend } = backendOf()
    let fail = true
    const flaky: ScreenBackend = {
      ...backend,
      capture: input => (fail ? Promise.reject(new Error('busy')) : backend.capture(input)),
    }
    const facility = createScreenFacility(flaky)
    expect(await capture(facility)).toMatchObject({ kind: 'rejected', reason: 'unavailable' })
    fail = false
    expect(await capture(facility)).toMatchObject({ kind: 'done' })
  })

  it('a screen that is gone between the listing and the frame is not found', async () => {
    const { backend } = backendOf()
    let calls = 0
    const unplugged: ScreenBackend = {
      ...backend,
      capture: async input => (++calls > 1 ? 'not-found' : backend.capture(input)),
    }
    expect(await capture(createScreenFacility(unplugged), 'right')).toMatchObject({
      kind: 'rejected',
      reason: 'notFound',
    })
  })

  it('a frame of the right width and another height is not handed out', async () => {
    const { backend, shot } = backendOf()
    let calls = 0
    const squashed: ScreenBackend = {
      ...backend,
      capture: async input => (++calls > 1 ? shot(48, 24) : backend.capture(input)),
    }
    expect(await capture(createScreenFacility(squashed), 'right')).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
  })

  it('a frame that is not the size of the region asked for is not handed out', async () => {
    const { backend, shot } = backendOf()
    const scaling: ScreenBackend = {
      ...backend,
      capture: async input =>
        input.region === null ? backend.capture(input) : shot(input.region.width * 2, 4),
    }
    const facility = createScreenFacility(scaling)
    const region = { x: 0, y: 0, width: 8, height: 4 }
    expect(await facility.capture({ ...request(), screen: 'left', region })).toMatchObject({
      kind: 'rejected',
      reason: 'unavailable',
    })
  })
})

describe('whether this host offers the screen facility', () => {
  const none = async () => undefined

  it('offers the backend of the system when its listing holds together', async () => {
    const { backend } = backendOf()
    expect(await offeredScreen(async () => backend)).toEqual({ kind: 'offered', backend })
  })

  it('offers none where the system has no backend, where the listing does not hold, and where it cannot be listed', async () => {
    expect(await offeredScreen(none)).toEqual({
      kind: 'absent',
      reason: 'this system has no screen backend',
    })
    expect(await offeredScreen(async () => backendOf([]).backend)).toEqual({
      kind: 'absent',
      reason: 'no screen is listed',
    })
    const broken: ScreenBackend = {
      ...backendOf().backend,
      list: () => Promise.reject(new Error('no display')),
    }
    expect(await offeredScreen(async () => broken)).toEqual({
      kind: 'absent',
      reason: 'the screens cannot be listed: no display',
    })
    const throwing = () => Promise.reject(new Error('load failed'))
    expect(await offeredScreen(throwing)).toEqual({
      kind: 'absent',
      reason: 'the screen backend cannot be chosen: load failed',
    })
  })

  it('a provider given a backend lists screen among its facilities and leases it; one given none does not', async () => {
    const { backend, state } = backendOf()
    const withScreen = createHostFilesProvider({ domain: createHostFilesDomain(), screen: backend })
    expect(withScreen.facilities).toEqual(['files', 'command', 'terminal', 'screen'])
    expect((await withScreen.describe()).facilities).toEqual(withScreen.facilities)
    const bare = createHostFilesProvider({ domain: createHostFilesDomain() })
    expect(bare.facilities).toEqual(['files', 'command', 'terminal'])
    state.permission = 'unsatisfied'
    expect((await withScreen.describe()).prerequisites).toBe('unsatisfied')
  })
})
