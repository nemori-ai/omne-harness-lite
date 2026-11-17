import type { ToolState } from '@omne-harness/tool-contract'

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
