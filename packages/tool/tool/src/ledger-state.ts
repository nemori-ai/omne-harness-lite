import type { ToolStartRecord, ToolState } from '@omne-harness/tool-contract'

/** The fields every phase of a call state carries. */
export type CommonState = Pick<
  ToolState,
  | 'call'
  | 'label'
  | 'revision'
  | 'foreground'
  | 'effect'
  | 'execution'
  | 'timing'
  | 'queue'
  | 'controls'
  | 'delivery'
  | 'supplements'
>

export type StateBody = ToolState extends infer S
  ? S extends ToolState
    ? Omit<S, 'source'>
    : never
  : never

export function commonOf(state: ToolState): CommonState {
  const { call, label, revision, foreground, effect, execution, timing, queue } = state
  const { controls, delivery, supplements } = state
  return {
    call,
    label,
    revision,
    foreground,
    effect,
    execution,
    timing,
    queue,
    controls,
    delivery,
    supplements,
  }
}

export function resumePlanningBody(
  state: ToolState,
  start: ToolStartRecord | null,
): StateBody | null {
  if (state.phase === 'suspended')
    return {
      ...commonOf(state),
      phase: 'suspended',
      checkpoint: state.checkpoint,
      relation: 'foreground',
      wait: state.wait,
    }
  if (state.phase === 'starting' && start?.kind === 'resume')
    return { ...commonOf(state), phase: 'starting', relation: 'foreground', wait: { kind: 'none' } }
  return null
}
