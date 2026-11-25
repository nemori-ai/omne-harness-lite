import { createHash } from 'node:crypto'
import type { InputId } from '@omne-harness/session-contract'
import type { Ordinary } from './ports.ts'
import { GOAL_SOURCES, type GoalSource } from './sources.ts'

const CHECKED =
  'Each time you are about to stop, what you did is checked against this goal. While it is not met and no exit of it came about, you are sent on.'

/** The first input of work on a goal nobody proposed in this session: the goal, and what stopping means under it. */
export function startText(rendered: string): string {
  return [
    'A goal was set for this session. Work on it now.',
    CHECKED,
    `The goal:\n${rendered}`,
  ].join('\n\n')
}

/** The input that starts work again after the goal stood paused. */
export function resumeText(rendered: string): string {
  return [
    'The goal of this session was resumed. Go on with it from where the work stands.',
    CHECKED,
    `The goal as it stands now:\n${rendered}`,
  ].join('\n\n')
}

/** One ordinary input a system part sends: a system reminder whose identities come from the input identity. */
export function reminderInput(source: GoalSource, input: InputId, text: string): Ordinary {
  const id = createHash('sha256').update(`goal-session/1:message/${input}`).digest('hex')
  const message = {
    id: `msg_${id.slice(0, 40)}`,
    role: 'system_reminder',
    blocks: [
      {
        kind: 'text',
        id: `blk_${id.slice(0, 32)}`,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
  } as unknown as Ordinary['message']
  return {
    kind: 'ordinary',
    input,
    message,
    origin: {
      owner: '@omne-harness/goal-session',
      record: input,
      revision: '1',
      digest: `sha256:${id}`,
    },
    source: GOAL_SOURCES[source],
  }
}
