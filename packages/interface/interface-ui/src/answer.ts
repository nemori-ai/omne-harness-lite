import type { InspectionAsked, InspectionResult } from '@omne-harness/interface-protocol'

/** The host application draws the named page in the mode, or says why it cannot. */
export type DrawPage = (asked: InspectionAsked, signal: AbortSignal) => Promise<InspectionResult>
export type DeliverResult = (request: string, result: InspectionResult) => Promise<unknown>

const UNSUPPORTED: InspectionResult = Object.freeze({ kind: 'cannot', reason: 'unsupported' })

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

/**
 * Answers the requests of one observation in the order they came, one drawing at a time.
 * A drawing that failed is not answered: the request runs out at the server, so its outcome is not made up.
 */
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
