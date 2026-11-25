import type { CallContext, CanvasOperations } from '@omne-harness/canvas-contract'
import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

/** What the application binds to one call. Who moves a thing comes from here, never from the model. */
export type CanvasCallSource = Readonly<{
  tenant: string
  call: string
  face(): CanvasOperations | undefined
  context(): Promise<CallContext | undefined>
}>

export type Reached = Readonly<{ face: CanvasOperations; context: CallContext }>

export type Unreachable = Readonly<{ unreachable: 'unavailable' | 'forbidden' }>

export type BoundCanvas = Readonly<{ reach(): Promise<Reached | Unreachable> }>

const unavailable: Unreachable = { unreachable: 'unavailable' }
const forbidden: Unreachable = { unreachable: 'forbidden' }

/** A context of another tenant is refused before the canvas is asked; the call it carries names the agent. */
export function bindCanvas(source: CanvasCallSource): BoundCanvas {
  return {
    async reach() {
      const face = source.face()
      if (face === undefined) return unavailable
      const context = await (async () => source.context())().catch(() => undefined)
      if (context === undefined) return unavailable
      if (context.tenant !== source.tenant) return forbidden
      return { face, context: { ...context, call: source.call } }
    },
  }
}

/** Keyed by the call's abort signal: a checkpoint segment gets a narrowed context that keeps it. */
const attachments = new WeakMap<AbortSignal, BoundCanvas>()
export function canvasOf(context: Pick<ToolExecutionContext, 'signal'>): BoundCanvas | undefined {
  return attachments.get(context.signal)
}

export function attachCanvas(scope: ToolExecutionScope, canvas: BoundCanvas): ToolExecutionScope {
  const context = scope.context
  attachments.set(context.signal, canvas)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      if (attachments.get(context.signal) === canvas) attachments.delete(context.signal)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
