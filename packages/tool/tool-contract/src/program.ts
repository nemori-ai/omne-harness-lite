import type { JsonValue } from '@omne-harness/json-text'
import type { ToolExecutionContext, ToolExecutionScope } from './author-context.ts'
import type { FixedToolRequest, ToolDefinition, ToolInvokeRequest } from './definitions.ts'
import type { ToolStartRecord } from './ports.ts'
import type {
  Adoption,
  CallAccess,
  ToolCallId,
  ToolOperationId,
  ToolResultVersion,
} from './identity.ts'
import type { ProgramFunction } from './program-signature.ts'
import type { ToolForwardSourceOutcome } from './forwarding.ts'
import type { ToolInvokeOutcome } from './operations.ts'
import type { Effect, Reply, ToolTerminal } from './results.ts'

/** What one position of a program calls. `digest` names the definition, the command and the arguments. */
export type PositionTarget = Readonly<{
  name: string
  command: string | null
  digest: string
  preview?: string
}>

export type PositionExclusion = Readonly<{
  kind: 'denied' | 'not-accepted' | 'unavailable' | 'closed'
  reason: string
}>

export type PositionStop = 'accepted' | 'refused' | 'unknown' | 'stopped'

export type ProgramPosition = Readonly<{
  ordinal: number
  child: ToolCallId
  admission: ToolOperationId
  target: PositionTarget
}> &
  (
    | Readonly<{ state: 'registered' }>
    | Readonly<{ state: 'handed'; background: boolean; stop?: PositionStop }>
    | Readonly<{ state: 'excluded'; exclusion: PositionExclusion }>
    | Readonly<{
        state: 'retained'
        result: ToolResultVersion
        terminal: ToolTerminal
        effect: Effect
        late: boolean
      }>
  )

/** TL-69: the closing barrier. `reach` only widens, `cause` is never rewritten, `cut` is of that moment. */
export type ProgramFence = Readonly<{
  reach: 'foreground' | 'all'
  cause: 'failed' | 'stopped' | 'withdrawn'
  cut: readonly Readonly<{ ordinal: number; relation: 'foreground' | 'background' | 'unplaced' }>[]
}>

export type ProgramTable = Readonly<{
  phase: 'open' | 'sealed' | 'closing'
  fence?: ProgramFence
  positions: readonly ProgramPosition[]
}>

export function inReachOf(fence: ProgramFence, ordinal: number): boolean {
  if (fence.reach === 'all') return true
  return fence.cut.find(one => one.ordinal === ordinal)?.relation !== 'background'
}

type At = Readonly<{ ordinal: number }>

/** The position table of a parent call. Every method is one conditional commit in the domain of that call. */
export interface ToolChildren<P> {
  register(
    input: CallAccess<P> &
      At &
      Readonly<{ child: ToolCallId; admission: ToolOperationId; target: PositionTarget }>,
  ): Reply<ProgramPosition>
  exclude(
    input: CallAccess<P> & At & Readonly<{ exclusion: PositionExclusion }>,
  ): Reply<ProgramPosition>
  handOff(input: CallAccess<P> & At): Reply<ProgramPosition>
  background(input: CallAccess<P> & At): Reply<ProgramPosition>
  retain(
    input: CallAccess<P> &
      At &
      Readonly<{ result: ToolResultVersion; terminal: ToolTerminal; effect: Effect }>,
  ): Reply<ProgramPosition>
  seal(input: CallAccess<P>): Reply<ProgramTable>
  close(input: CallAccess<P> & Pick<ProgramFence, 'reach' | 'cause'>): Reply<ProgramTable>
  stopping(input: CallAccess<P> & At & Readonly<{ progress: PositionStop }>): Reply<ProgramPosition>
  dispose(input: CallAccess<P>): Reply<ProgramTable>
  table(input: CallAccess<P>): Reply<ProgramTable>
}

export function isProgramSettled(table: ProgramTable): boolean {
  return (
    table.phase === 'sealed' &&
    table.positions.every(
      position => position.state === 'excluded' || position.state === 'retained',
    )
  )
}

export type ProgramParent<P> = CallAccess<P> &
  Readonly<{ start: Extract<ToolStartRecord, { kind: 'start' }>; request: FixedToolRequest }>

export type NestedAdmissionInput<P> = ProgramParent<P> &
  At &
  Readonly<{
    target: Readonly<{
      definition: Adoption
      name: string
      command: string | null
      arguments: string
    }>
  }>
export type NestedAdmission =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'denied'; reason: string }>
  | Readonly<{ kind: 'unanswerable'; diagnostic: string }>

/** Asks whoever drives the parent call whether the action at one position may run. Tool does not judge it. */
export interface ProgramActionAdmission<P> {
  admit(input: NestedAdmissionInput<P>, signal: AbortSignal): Promise<NestedAdmission>
}

export type ProgramCallFailureKind =
  | 'denied'
  | 'unsupported'
  | 'invalid'
  | 'limit'
  | 'unavailable'
  | 'failed'
  | 'interrupted'
  | 'no-response'
  | 'unknown'
export type ProgramCallEffect = 'none' | 'occurred' | 'unknown'
export type ProgramCallFailure = Readonly<{
  kind: ProgramCallFailureKind
  effect: ProgramCallEffect
  message: string
}>
export type ProgramCallAnswer =
  | Readonly<{ kind: 'value'; value: JsonValue | null; external: boolean }>
  | Readonly<{ kind: 'failure'; failure: ProgramCallFailure }>

export interface ProgramTools {
  functions(names: readonly string[]): Reply<readonly ProgramFunction[]>
  call(input: At & Readonly<{ entry: string; arguments: JsonValue }>): Promise<ProgramCallAnswer>
  /** The body returned: no further position, and the table once every position is excluded or retained. */
  settle(): Reply<ProgramTable>
  table(): Reply<ProgramTable>
  abandon(): Reply<ProgramTable>
}

export function owesDisposal(table: ProgramTable): readonly ProgramPosition[] {
  const { fence } = table
  if (table.phase !== 'closing' || fence === undefined) return []
  return table.positions.filter(
    position =>
      inReachOf(fence, position.ordinal) &&
      (position.state === 'registered' ||
        (position.state === 'handed' && position.stop === undefined)),
  )
}

const attached = new WeakMap<ToolExecutionContext, ProgramTools>()

export function programToolsOf(context: ToolExecutionContext): ProgramTools | undefined {
  return attached.get(context)
}

/** Attach after every attachment that makes a new context. Finish closes the capability first. */
export function attachProgramTools(
  scope: ToolExecutionScope,
  capability: Readonly<{ value: ProgramTools; close(): Promise<void> }>,
): ToolExecutionScope {
  attached.set(scope.context, capability.value)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context: scope.context,
    limits: scope.limits,
    finish(exit) {
      finished ??= (async () => {
        attached.delete(scope.context)
        await capability.close()
        return scope.finish(exit)
      })()
      return finished
    },
  }
}

export type ProgramTargetOutcome =
  | Readonly<{ kind: 'target'; definition: ToolDefinition; request: ToolInvokeRequest }>
  | Readonly<{ kind: 'refused'; failure: ProgramCallFailure }>

export interface ToolProgramSource<P> {
  resolve(
    input: ProgramParent<P> & At & Readonly<{ target: ToolInvokeRequest }>,
  ): Promise<ToolForwardSourceOutcome>
}

export interface ToolProgramRuntime<P> {
  invoke(
    input: ProgramParent<P> & At & Readonly<{ target: ToolInvokeRequest }>,
  ): Promise<ToolInvokeOutcome>
}
