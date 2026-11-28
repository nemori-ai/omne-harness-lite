import type {
  InspectionAsked,
  InspectionNow,
  InspectionResult,
  SeenResult,
} from '@omne-harness/interface-protocol'
import { measure, waitFor } from './measure.ts'

/** The host application draws the named page in the mode, or says why it cannot. */
export type DrawPage = (asked: InspectionAsked, signal: AbortSignal) => Promise<InspectionResult>
export type DeliverResult = (request: string, result: InspectionResult) => Promise<unknown>
export type DeliverSeen = (request: string, result: SeenResult, met: boolean) => Promise<unknown>

export type Box = Readonly<{ x: number; y: number; w: number; h: number }>
export type Picture = Readonly<{ bytes: Uint8Array; width: number; height: number }>

/** The page the person uses, as the host lends it: the document to read, the page shown, and a picture of the window. */
export type SeeNow = Readonly<{
  root: () => Document | undefined
  page?: () => string | null
  capture?: (box: Box | undefined) => Promise<Picture | undefined>
}>

const UNSUPPORTED = Object.freeze({ kind: 'cannot', reason: 'unsupported' } as const)
const UNSETTLED = Object.freeze({ kind: 'cannot', reason: 'not-settled' } as const)

async function drawn(
  draw: DrawPage | undefined,
  asked: InspectionAsked,
  signal: AbortSignal,
): Promise<InspectionResult | undefined> {
  if (draw === undefined) return UNSUPPORTED
  try {
    return await draw(asked, signal)
  } catch {
    return undefined
  }
}

/** What the person sees now, read without changing the page: after what was waited for came or its time ran out. */
async function seen(
  asked: InspectionNow,
  see: SeeNow | undefined,
  signal: AbortSignal,
): Promise<Readonly<{ result: SeenResult; met: boolean }>> {
  const root = see?.root()
  if (see === undefined || root === undefined) return { result: UNSUPPORTED, met: false }
  const met = asked.until === undefined || (await waitFor(root, asked.until, signal))
  const structure = measure(root, {
    ...(asked.part !== undefined && { part: asked.part }),
    page: see.page?.() ?? null,
  })
  if (asked.want === 'structure') return { result: { kind: 'structure', structure }, met }
  if (see.capture === undefined) return { result: UNSUPPORTED, met }
  const box = asked.part === undefined ? undefined : structure.parts[0]?.box
  const picture = await see.capture(box).catch(() => undefined)
  if (picture === undefined) return { result: UNSETTLED, met }
  return { result: { kind: 'image', ...picture, structure }, met }
}

/** One drawing at a time, in the order asked; a drawing that failed is not answered, so the request runs out at the server. */
export async function answerRequests(
  frames: AsyncIterator<InspectionAsked, unknown>,
  draw: DrawPage | undefined,
  deliver: DeliverResult,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const next = await frames.next()
    if (next.done === true || signal.aborted) return
    const result = await drawn(draw, next.value, signal)
    if (signal.aborted) return
    if (result === undefined) continue
    try {
      await deliver(next.value.request, result)
    } catch {}
  }
}

/** One question of now at a time, in the order asked, each answered with what the person sees then. */
export async function answerNow(
  frames: AsyncIterator<InspectionNow, unknown>,
  see: SeeNow | undefined,
  deliver: DeliverSeen,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const next = await frames.next()
    if (next.done === true || signal.aborted) return
    const told = await seen(next.value, see, signal)
    if (signal.aborted) return
    await deliver(next.value.request, told.result, told.met).catch(() => undefined)
  }
}
