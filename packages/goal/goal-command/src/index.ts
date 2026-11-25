import { createHash } from 'node:crypto'
import { GOAL_USAGE } from '@omne-harness/goal-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import type { CommandEntry, EntrySource } from '@omne-harness/slash-command-contract'

/** The source and its namespace. A namespace of its own: the reserved one is held by the system commands. */
export const GOAL_COMMAND_SOURCE = 'goal-command'
export const GOAL_COMMAND_SPACE = 'goal'
export const GOAL_COMMAND_NAME = 'goal'

/** What the model reads after the person's own line: that a goal is asked for, then the one usage text of goals. */
export const GOAL_COMMAND_PROMPT = `The person asks for a goal for this session. What they wrote with the command says what they want.\n\n${GOAL_USAGE}`

const ENTRY: CommandEntry = {
  space: GOAL_COMMAND_SPACE,
  name: GOAL_COMMAND_NAME,
  kind: 'prompt',
  title: '给这段会话设一个目标',
  hint: '想做成什么',
}
const ORIGIN = Object.freeze({
  name: `${GOAL_COMMAND_SPACE}:${GOAL_COMMAND_NAME}`,
  layer: 'official',
  version: '1',
  digest: `sha256:${createHash('sha256').update(GOAL_COMMAND_PROMPT).digest('hex')}`,
})

/** The official entrance source of goals: one prompt command, the same for every asker. */
export function createGoalCommandSource<P>(): EntrySource<P> {
  return {
    name: GOAL_COMMAND_SOURCE,
    space: GOAL_COMMAND_SPACE,
    list: async () => succeed([ENTRY]),
    take: async (_asker, name) =>
      name === GOAL_COMMAND_NAME
        ? succeed({ kind: 'text', text: GOAL_COMMAND_PROMPT, origin: ORIGIN })
        : fail('not-listed'),
  }
}
