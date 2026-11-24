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

/** The relation a call keeps through its waits: pausing, resuming and closing a wait never move it. */
export function keptRelation(
  state: Pick<ToolState, 'relation'>,
): Readonly<{ relation: 'background' }> | Readonly<{ relation: 'foreground' }> {
  return state.relation === 'background' ? { relation: 'background' } : { relation: 'foreground' }
}

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
  if (state.phase === 'suspended') {
    const shared = { ...commonOf(state), phase: 'suspended', checkpoint: state.checkpoint } as const
    return state.relation === 'background'
      ? { ...shared, relation: 'background', wait: state.wait }
      : { ...shared, relation: 'foreground', wait: state.wait }
  }
  if (state.phase === 'starting' && start?.kind === 'resume')
    return { ...commonOf(state), phase: 'starting', ...keptRelation(state), wait: { kind: 'none' } }
  return null
}
