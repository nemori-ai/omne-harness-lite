import type {
  FacilityReason,
  FacilityRequest,
  FacilityResult,
  ScreenFacility,
  ScreenFrame,
  ScreenInfo,
  ScreenRegion,
} from '@omne-harness/execution-environment-contract'
import {
  monitorsProblem,
  regionWithin,
  selfCheck,
  type Monitor,
  type ScreenBackend,
  type Shot,
} from '@omne-harness/screen'

export type OfferedScreen =
  | Readonly<{ kind: 'offered'; backend: ScreenBackend }>
  | Readonly<{ kind: 'absent'; reason: string }>

const said = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Whether this host offers `screen`: a backend for the system whose listing holds together. */
export async function offeredScreen(
  choose: () => Promise<ScreenBackend | undefined>,
): Promise<OfferedScreen> {
  const absent = (reason: string): OfferedScreen => ({ kind: 'absent', reason })
  let backend: ScreenBackend | undefined
  try {
    backend = await choose()
  } catch (error) {
    return absent(`the screen backend cannot be chosen: ${said(error)}`)
  }
  if (backend === undefined) return absent('this system has no screen backend')
  let monitors: readonly Monitor[]
  try {
    monitors = await backend.list()
  } catch (error) {
    return absent(`the screens cannot be listed: ${said(error)}`)
  }
  const problem = monitorsProblem(monitors)
  return problem === null ? { kind: 'offered', backend } : absent(problem)
}

const REFUSED: Readonly<Record<'unsatisfied' | 'unknown', FacilityReason>> = {
  unsatisfied: 'notAuthorized',
  unknown: 'unavailable',
}

function frameOf(screen: ScreenInfo, region: ScreenRegion, shot: Shot): ScreenFrame {
  const { png, width, height } = shot
  return {
    screen,
    region,
    image: { mediaType: 'image/png', bytes: png, width, height },
    takenAt:
      /* wall-clock: observation-time -- The instant a frame was taken, as the contract reports it. */ new Date().toISOString(),
  }
}

/** The backend of this system as the `screen` facility: it reads the screen and changes nothing. */
export function createScreenFacility(backend: ScreenBackend): ScreenFacility<unknown> {
  let sound: boolean | undefined
  /** One frame is taken once the permission is there: a backend that lies hands out nothing. */
  async function checked(): Promise<boolean> {
    if (sound !== undefined) return sound
    const check = await selfCheck(backend)
    if (check.kind !== 'unknown') sound = check.kind === 'passed'
    return check.kind === 'passed'
  }
  async function refusal(request: FacilityRequest<unknown>): Promise<FacilityReason | undefined> {
    if (request.binding.kind !== 'host_machine') return 'unsupported'
    const permission = await backend.permission()
    if (permission !== 'satisfied') return REFUSED[permission]
    return (await checked()) ? undefined : 'unavailable'
  }
  async function answered<T>(
    request: FacilityRequest<unknown>,
    work: () => Promise<T | FacilityReason>,
  ): Promise<FacilityResult<T>> {
    const { requestId } = request
    try {
      const value = (await refusal(request)) ?? (await work())
      return typeof value === 'string'
        ? { kind: 'rejected', requestId, reason: value as FacilityReason }
        : { kind: 'done', requestId, value: value as T }
    } catch {
      return { kind: 'unknown', requestId }
    }
  }
  return {
    list: request => answered(request, () => backend.list()),
    capture: request =>
      answered<ScreenFrame>(request, async () => {
        const monitors = await backend.list()
        const screen = monitors.find(each =>
          request.screen === null ? each.primary : each.id === request.screen,
        )
        if (screen === undefined) return 'notFound'
        const region = request.region ?? { x: 0, y: 0, ...screen.pixels }
        if (!regionWithin(region, screen.pixels)) return 'invalidInput'
        const shot = await backend.capture({ screen: screen.id, region: request.region })
        if (shot === 'not-found') return 'notFound'
        if (shot.width !== region.width || shot.height !== region.height) return 'unavailable'
        return frameOf(screen, region, shot)
      }),
  }
}
