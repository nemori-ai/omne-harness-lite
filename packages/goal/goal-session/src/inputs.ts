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

/** The input that sends the agent on: it was about to stop, the goal is not met, and these rows are still open. */
export function continueText(open: string): string {
  return [
    'You were about to stop, but the goal of this session is not met yet, so this run goes on.',
    ...(open === '' ? [] : [`Still open:\n${open}`]),
    'Work on what is open, and keep the progress list true with track. When you are about to stop again, it is checked again.',
  ].join('\n\n')
}

/** The input that sends the agent on in a session that drives itself and has no goal: it was about to stop, and what it was asked does not look done. */
export function impliedText(open: string): string {
  return [
    'You were about to stop, but what the input that opened this run asked for does not look done yet, so this run goes on.',
    ...(open === '' ? [] : [`Still open:\n${open}`]),
    'Go on with it. When you are about to stop again, it is checked again; if nothing more can be done, say plainly what is done and what is not.',
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
