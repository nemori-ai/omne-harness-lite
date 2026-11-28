import {
  excerptOf,
  type BodyIssue,
  type ObservedCall,
  type Uncited,
} from '@omne-harness/goal-contract'

const CITABLE_SHOWN = 12
const COMMAND_SHOWN = 60

function citable(call: ObservedCall): string {
  const { ref, tool, command, path } = call
  if (command !== null)
    return `${ref} ${tool} \`${excerptOf(command.trim().replace(/\s+/gu, ' '), COMMAND_SHOWN, 'head')}\``
  return path === null ? `${ref} ${tool}` : `${ref} ${tool} ${path}`
}

const shown = (made: readonly ObservedCall[]): string =>
  made
    .toSorted((a, b) => a.order - b.order)
    .slice(-CITABLE_SHOWN)
    .map(citable)
    .join('; ')

/** Why references do not stand, and the latest calls of the session that would: the agent sees no call id anywhere else. */
export function uncited(refs: readonly string[], made: readonly ObservedCall[]): BodyIssue {
  const missing = `no tool call of this session since the goal was set: ${refs.join(', ')}`
  const problem = made.length === 0 ? missing : `${missing}. Those you can cite: ${shown(made)}`
  return { entry: null, field: 'refs', problem }
}

export const NOTHING_TO_CITE =
  'you made no tool call in this examination yet: examine first, then hand in'

/** Why the readings of an examination are handed back: each one that stands on no call of it, then the calls of it that can be cited by their id. */
export function uncitedReadings(
  loose: readonly Uncited[],
  made: readonly ObservedCall[],
): readonly BodyIssue[] {
  const each = loose.map(({ criterion, refs }) => ({
    entry: criterion,
    field: 'refs',
    problem:
      refs.length === 0
        ? 'a reading that holds or fails cites at least one tool call of this examination'
        : `no tool call of this examination: ${refs.join(', ')}`,
  }))
  const problem = made.length === 0 ? NOTHING_TO_CITE : `Those you can cite: ${shown(made)}`
  return [...each, { entry: null, field: 'refs', problem }]
}
