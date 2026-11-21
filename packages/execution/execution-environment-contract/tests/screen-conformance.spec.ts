import { expect, it } from 'vitest'
import {
  originRef,
  type ScreenFacility,
  type ScreenInfo,
} from '@omne-harness/execution-environment-contract'
import {
  createScriptedScreenFacility,
  runConformanceCase,
  screenFacilityConformance,
  type ScreenConformanceSubject,
} from '@omne-harness/execution-environment-contract/testing'

const LEFT: ScreenInfo = {
  id: 'left',
  name: 'Built-in',
  primary: true,
  pixels: { width: 64, height: 40 },
  scale: 2,
  origin: { x: 0, y: 0 },
}
const RIGHT: ScreenInfo = {
  id: 'right',
  name: 'External',
  primary: false,
  pixels: { width: 48, height: 48 },
  scale: 1,
  origin: { x: 32, y: 0 },
}
const NAMES = [
  'screen.list',
  'screen.capture-primary',
  'screen.capture-each',
  'screen.capture-region',
  'screen.unknown-screen',
  'screen.invalid-region',
  'screen.not-authorized',
] as const

let request = 0
function subject(
  change: (facility: ScreenFacility<unknown>) => ScreenFacility<unknown> = facility => facility,
  screens: readonly ScreenInfo[] = [LEFT, RIGHT],
): ScreenConformanceSubject {
  const scripted = createScriptedScreenFacility({ screens })
  return {
    facility: change(scripted.facility),
    request: () => ({
      requestId: `request-${String(++request)}`,
      access: { principal: 'someone', tenant: 'tenant' as never },
      origin: originRef('conformance'),
      binding: { kind: 'host_machine' },
    }),
    control: { revoke: scripted.revoke },
  }
}
const one = (name: (typeof NAMES)[number], made: () => ScreenConformanceSubject) => {
  const test = screenFacilityConformance({ subject: made }).find(each => each.name === name)
  if (!test) throw new Error(`missing conformance case ${name}`)
  return runConformanceCase(test)
}

it('names its cases', () => {
  expect(screenFacilityConformance({ subject }).map(test => test.name)).toEqual([...NAMES])
})

it.each(NAMES)('%s accepts the scripted facility with two screens', async name => {
  expect(await one(name, subject)).toEqual({ name, status: 'pass' })
})

it('accepts a facility with one screen', async () => {
  for (const name of NAMES)
    expect(await one(name, () => subject(undefined, [LEFT]))).toMatchObject({ status: 'pass' })
})

it('rejects a facility that falls back to the primary screen for an identifier it does not know', async () => {
  const lenient = (facility: ScreenFacility<unknown>): ScreenFacility<unknown> => ({
    ...facility,
    capture: async input => {
      const answer = await facility.capture(input)
      return answer.kind === 'rejected' && answer.reason === 'notFound'
        ? facility.capture({ ...input, screen: null })
        : answer
    },
  })
  await expect(one('screen.unknown-screen', () => subject(lenient))).rejects.toMatchObject({
    name: 'AssertionError',
  })
  expect(await one('screen.capture-primary', () => subject(lenient))).toMatchObject({
    status: 'pass',
  })
})

it('rejects a facility that hands out a frame without the permission of the system', async () => {
  const blind = (facility: ScreenFacility<unknown>): ScreenFacility<unknown> => {
    const granted = createScriptedScreenFacility({ screens: [LEFT, RIGHT] }).facility
    return { list: facility.list, capture: input => granted.capture(input) }
  }
  await expect(one('screen.not-authorized', () => subject(blind))).rejects.toMatchObject({
    name: 'AssertionError',
  })
})

it('rejects a frame whose image is not the size of its region, and a frame of another screen', async () => {
  const scaled = (facility: ScreenFacility<unknown>): ScreenFacility<unknown> => ({
    ...facility,
    capture: async input => {
      const answer = await facility.capture(input)
      if (answer.kind !== 'done') return answer
      const { image } = answer.value
      return { ...answer, value: { ...answer.value, image: { ...image, width: image.width + 1 } } }
    },
  })
  await expect(one('screen.capture-primary', () => subject(scaled))).rejects.toMatchObject({
    name: 'AssertionError',
  })
  const swapped = (facility: ScreenFacility<unknown>): ScreenFacility<unknown> => ({
    ...facility,
    capture: input => facility.capture({ ...input, screen: null }),
  })
  await expect(one('screen.capture-each', () => subject(swapped))).rejects.toMatchObject({
    name: 'AssertionError',
  })
})

it('rejects a listing with two primary screens, and one that repeats an identifier', async () => {
  for (const screens of [
    [LEFT, { ...RIGHT, primary: true }],
    [LEFT, { ...RIGHT, id: 'left' }],
  ]) {
    const listed = (facility: ScreenFacility<unknown>): ScreenFacility<unknown> => ({
      ...facility,
      list: async input => ({ kind: 'done', requestId: input.requestId, value: screens }),
    })
    await expect(one('screen.list', () => subject(listed))).rejects.toMatchObject({
      name: 'AssertionError',
    })
  }
})

it('reports a missing permission control as not applicable', async () => {
  const bare = () => {
    const { control: _control, ...rest } = subject()
    return rest
  }
  expect(await one('screen.not-authorized', bare)).toMatchObject({ status: 'not-applicable' })
})
