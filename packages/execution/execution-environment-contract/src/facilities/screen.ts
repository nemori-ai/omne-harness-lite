import {
  describeFacility,
  type FacilityDescriptor,
  type FacilityRequest,
  type FacilityResult,
} from '../facility.ts'

/** Stays the same on one placement while no screen is added or removed. */
export type ScreenId = string
export type ScreenPoint = { readonly x: number; readonly y: number }
export type ScreenSize = { readonly width: number; readonly height: number }
/** A rectangle of one screen, in its physical pixels. */
export type ScreenRegion = ScreenPoint & ScreenSize

export type ScreenInfo = {
  readonly id: ScreenId
  readonly name: string
  readonly primary: boolean
  readonly pixels: ScreenSize
  /** How many physical pixels one logical point is. */
  readonly scale: number
  /** Where the screen is on the whole desktop, in logical points. */
  readonly origin: ScreenPoint
}

export type ScreenFrame = {
  readonly screen: ScreenInfo
  readonly region: ScreenRegion
  readonly image: ScreenSize & { readonly mediaType: 'image/png'; readonly bytes: Uint8Array }
  readonly takenAt: string
}

export interface ScreenFacility<P> {
  list(request: FacilityRequest<P>): Promise<FacilityResult<readonly ScreenInfo[]>>
  capture(
    request: FacilityRequest<P> & {
      readonly screen: ScreenId | null
      readonly region: ScreenRegion | null
    },
  ): Promise<FacilityResult<ScreenFrame>>
}

declare module '../facility.ts' {
  interface EnvironmentFacilities {
    screen: ScreenFacility<unknown>
  }
}

export const screenFacility: FacilityDescriptor<'screen'> = describeFacility('screen', {
  list: 'guarded',
  capture: 'guarded',
})

type FrameGeometry = Readonly<{ image: ScreenSize; region: ScreenRegion }>

/** A point of the image of a frame, as physical pixels of the screen the frame was taken of. */
export function imagePointOnScreen(frame: FrameGeometry, point: ScreenPoint): ScreenPoint {
  const { image, region } = frame
  return {
    x: region.x + (point.x * region.width) / image.width,
    y: region.y + (point.y * region.height) / image.height,
  }
}

/** A point of a screen in physical pixels, as logical points of the whole desktop. */
export function screenPointOnDesktop(
  screen: Pick<ScreenInfo, 'scale' | 'origin'>,
  point: ScreenPoint,
): ScreenPoint {
  return {
    x: screen.origin.x + point.x / screen.scale,
    y: screen.origin.y + point.y / screen.scale,
  }
}
