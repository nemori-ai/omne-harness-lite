import { createHash } from 'node:crypto'
import type { Dispatch, SessionRef } from '@omne-harness/dispatch-contract'
import type { InputId, RelationToReference } from '@omne-harness/session-contract'
import type { Ordinary } from './ports.ts'
import { DISPATCH_SOURCES, type DispatchSource } from './sources.ts'

type Work = Pick<Dispatch, 'id' | 'mode' | 'dispatcher' | 'instruction' | 'expectation'>

const hope = (expectation: string | null): string =>
  expectation === null ? '' : `\n\nThe shape the dispatcher hopes the report has:\n${expectation}`

const FORKED =
  'This session is forked from the dispatching session: the conversation above is what its agent saw up to the moment it dispatched this work. From here on you are another agent. The tool calls in that conversation are finished and not yours to go on with, and what that session does after the dispatch you do not see.'

/** The starting input of a dispatched session: the work, and how its one report goes back. */
export function instructionText(work: Work): string {
  if (work.mode === 'handoff')
    return [
      'Another agent handed this work over to this session. The work is yours from here: there is no report to hand back, and a person attends this session.',
      `Session it came from: ${work.dispatcher}`,
      `Handover note:\n${work.instruction}`,
    ].join('\n\n')
  return [
    'Another agent dispatched one piece of work to you. Nobody attends this session: do the work with what you have, and do not ask a person.',
    'When the work is done, hand back one report with the command `report` of the tool `Agents`. There is one report for this work. If you stop without it, with no turn going, no input waiting and no call of yours in the background, your last reply is taken as the report.',
    `Dispatching session: ${work.dispatcher}\nDispatch: ${work.id}`,
    ...(work.mode === 'spawn' ? [FORKED] : []),
    `Work:\n${work.instruction}${hope(work.expectation)}`,
  ].join('\n\n')
}

type From = Readonly<{ session: SessionRef; agent: string | null }>

/** The report of a dispatch, put into the dispatching session after its call stopped waiting. */
export function reportText(from: From, text: string): string {
  return [
    'The report of work you dispatched arrived after your call stopped waiting for it. This is the one report of that dispatch.',
    `From session: ${from.session}\nAgent definition: ${from.agent ?? 'unknown'}`,
    `Report:\n${text}`,
  ].join('\n\n')
}

export function messageText(
  from: From,
  relation: RelationToReference | null,
  text: string,
): string {
  return [
    'A message from the agent of another session. It is not a report and ends no dispatch. Answer it with the command `message` of the tool `Agents`, if an answer is needed. Then end your turn with one short line of what you did with it: a turn cannot end with no reply.',
    `From session: ${from.session}\nAgent definition: ${from.agent ?? 'unknown'}\nWhat that session is to yours: ${relation ?? 'unknown'}`,
    `Message:\n${text}`,
  ].join('\n\n')
}

/** One ordinary input a system part sends: a system reminder whose identities come from the input identity. */
export function reminderInput(source: DispatchSource, input: InputId, text: string): Ordinary {
  const id = createHash('sha256').update(`dispatch-session/1:message/${input}`).digest('hex')
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
      owner: '@omne-harness/dispatch-session',
      record: input,
      revision: '1',
      digest: `sha256:${id}`,
    },
    source: DISPATCH_SOURCES[source],
  }
}
