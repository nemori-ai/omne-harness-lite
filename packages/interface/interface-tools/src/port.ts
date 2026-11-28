import type {
  InspectionMode,
  InspectionReason,
  Structure,
  Until,
} from '@omne-harness/interface-protocol'
import type {
  ToolExecutionContext,
  ToolExecutionScope,
  ToolMediaSink,
} from '@omne-harness/tool-contract/provider'

/** One look as the tool asks it: the page, its subject and the mode, already within bounds; a part to keep to; what to wait for. */
export type LookAsked = Readonly<{
  page: string
  subject?: string
  mode: InspectionMode
  part?: string
  until?: Until
}>

export type Picture = Readonly<{ bytes: Uint8Array; width: number; height: number }>

type Unanswered =
  | Readonly<{ kind: 'cannot'; reason: InspectionReason }>
  | Readonly<{ kind: 'client-absent' }>
  | Readonly<{ kind: 'unavailable'; why: string }>
  | Readonly<{ kind: 'cancelled' }>

export type Looked =
  | Readonly<{ kind: 'image'; image: Picture & Readonly<{ structure?: Structure }> }>
  | Unanswered

/** A question of what the person sees now: its structure, or a picture of it. */
export type NowAsked = Readonly<{ want: 'structure' | 'image'; part?: string; until?: Until }>

export type Nowed =
  | Readonly<{ kind: 'seen'; structure?: Structure; image?: Picture; met: boolean }>
  | Unanswered

/** What the application binds to one call: where a look is asked, for the tenant of the call, and where its picture is kept. */
export type AppViewSource = Readonly<{
  look(asked: LookAsked, signal: AbortSignal): Promise<Looked>
  now(asked: NowAsked, signal: AbortSignal): Promise<Nowed>
  media: ToolMediaSink
}>

const attachments = new WeakMap<AbortSignal, AppViewSource>()

export const appViewOf = (context: Pick<ToolExecutionContext, 'signal'>) =>
  attachments.get(context.signal)

export function attachAppView(
  scope: ToolExecutionScope,
  source: AppViewSource,
): ToolExecutionScope {
  const { context } = scope
  attachments.set(context.signal, source)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits: scope.limits,
    finish(exit) {
      if (finished !== undefined) return finished
      if (attachments.get(context.signal) === source) attachments.delete(context.signal)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
