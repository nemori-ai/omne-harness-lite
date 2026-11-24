import assert from 'node:assert/strict'
import type {
  FacilityRequest,
  FacilityResult,
  ScreenFacility,
  ScreenFrame,
  ScreenInfo,
  ScreenRegion,
} from '../index.ts'
import { imagePointOnScreen } from '../index.ts'
import { bounded, NotApplicable, type ConformanceCase } from './case.ts'

export type ScreenConformanceSubject = Readonly<{
  facility: ScreenFacility<unknown>
  request(): FacilityRequest<unknown>
  /** Absent where the permission of the system cannot be taken away by a test. */
  control?: { revoke(): void | Promise<void> }
  dispose?(): Promise<void>
}>
export type ScreenConformanceOptions = Readonly<{
  subject(): ScreenConformanceSubject | Promise<ScreenConformanceSubject>
  waitMs?: number
}>

function done<T>(answer: FacilityResult<T>): T {
  assert.equal(answer.kind, 'done')
  if (answer.kind !== 'done') throw new assert.AssertionError({ message: 'expected done' })
  return answer.value
}
function refusal(answer: FacilityResult<unknown>): string {
  assert.equal(answer.kind, 'rejected')
  return answer.kind === 'rejected' ? answer.reason : ''
}
const positive = (value: number) => Number.isSafeInteger(value) && value > 0

const listed = async (s: ScreenConformanceSubject) => done(await s.facility.list(s.request()))
const captured = (
  s: ScreenConformanceSubject,
  screen: string | null,
  region: ScreenRegion | null = null,
) => s.facility.capture({ ...s.request(), screen, region })

/** The width and height a PNG declares for itself. */
function declared(bytes: Uint8Array): readonly [number, number] {
  const view = Buffer.from(bytes)
  assert.deepEqual([...view.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return [view.readUInt32BE(16), view.readUInt32BE(20)]
}

/** EX-16: a frame carries the geometry of its screen, its region, its own size and its instant. */
function checkFrame(frame: ScreenFrame, screen: ScreenInfo, region: ScreenRegion): void {
  assert.deepEqual(frame.screen, screen)
  assert.deepEqual(frame.region, region)
  assert.equal(frame.image.mediaType, 'image/png')
  assert.deepEqual([frame.image.width, frame.image.height], [region.width, region.height])
  assert.deepEqual(declared(frame.image.bytes), [region.width, region.height])
  assert.ok(Number.isFinite(Date.parse(frame.takenAt)))
  const corner = { x: frame.image.width, y: frame.image.height }
  assert.deepEqual(imagePointOnScreen(frame, corner), {
    x: region.x + region.width,
    y: region.y + region.height,
  })
}
const wholeOf = (screen: ScreenInfo): ScreenRegion => ({ x: 0, y: 0, ...screen.pixels })

async function checkList(s: ScreenConformanceSubject): Promise<void> {
  const screens = await listed(s)
  assert.ok(screens.length > 0)
  assert.equal(screens.filter(screen => screen.primary).length, 1)
  assert.equal(new Set(screens.map(screen => screen.id)).size, screens.length)
  for (const screen of screens) {
    assert.ok(screen.id.length > 0)
    assert.ok(positive(screen.pixels.width) && positive(screen.pixels.height))
    assert.ok(Number.isFinite(screen.scale) && screen.scale > 0)
    assert.ok(Number.isFinite(screen.origin.x) && Number.isFinite(screen.origin.y))
  }
  assert.deepEqual(await listed(s), screens)
}
async function checkPrimary(s: ScreenConformanceSubject): Promise<void> {
  const primary = (await listed(s)).find(screen => screen.primary)
  assert.ok(primary)
  checkFrame(done(await captured(s, null)), primary, wholeOf(primary))
}
async function checkEach(s: ScreenConformanceSubject): Promise<void> {
  for (const screen of await listed(s))
    checkFrame(done(await captured(s, screen.id)), screen, wholeOf(screen))
}
async function checkRegion(s: ScreenConformanceSubject): Promise<void> {
  const [screen] = await listed(s)
  assert.ok(screen)
  const region = {
    x: 1,
    y: 2,
    width: Math.max(1, Math.floor(screen.pixels.width / 2)),
    height: Math.max(1, Math.floor(screen.pixels.height / 2)),
  }
  checkFrame(done(await captured(s, screen.id, region)), screen, region)
}
async function checkUnknown(s: ScreenConformanceSubject): Promise<void> {
  const known = (await listed(s)).map(screen => screen.id)
  const stranger = `${known.join('+')}+stranger`
  assert.equal(refusal(await captured(s, stranger)), 'notFound')
}
async function checkInvalidRegion(s: ScreenConformanceSubject): Promise<void> {
  const [screen] = await listed(s)
  assert.ok(screen)
  const { width, height } = screen.pixels
  for (const region of [
    { x: 0, y: 0, width: 0, height },
    { x: 0, y: 0, width, height: -1 },
    { x: 1, y: 0, width, height },
    { x: 0, y: 1, width, height },
    { x: -1, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 1.5, height: 1 },
  ])
    assert.equal(refusal(await captured(s, screen.id, region)), 'invalidInput')
}
async function checkNotAuthorized(s: ScreenConformanceSubject): Promise<void> {
  if (!s.control) throw new NotApplicable('the subject cannot take the permission away')
  const [screen] = await listed(s)
  assert.ok(screen)
  await s.control.revoke()
  assert.equal(refusal(await s.facility.list(s.request())), 'notAuthorized')
  assert.equal(refusal(await captured(s, null)), 'notAuthorized')
  assert.equal(refusal(await captured(s, screen.id)), 'notAuthorized')
}

export function screenFacilityConformance(
  options: ScreenConformanceOptions,
): readonly ConformanceCase[] {
  const cases = [
    ['screen.list', checkList],
    ['screen.capture-primary', checkPrimary],
    ['screen.capture-each', checkEach],
    ['screen.capture-region', checkRegion],
    ['screen.unknown-screen', checkUnknown],
    ['screen.invalid-region', checkInvalidRegion],
    ['screen.not-authorized', checkNotAuthorized],
  ] as const
  return cases.map(([name, check]) => ({
    name,
    async run() {
      const subject = await options.subject()
      try {
        await bounded(check(subject), options.waitMs ?? 1000)
      } finally {
        await subject.dispose?.()
      }
    },
  }))
}
