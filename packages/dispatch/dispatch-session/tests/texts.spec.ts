import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { InputId } from '@omne-harness/session-contract'
import {
  DISPATCH_SOURCES,
  dispatchInputSources,
  instructionText,
  messageText,
  reportText,
  sessionOfDispatch,
} from '../src/index.ts'
import { reminderInput } from '../src/inputs.ts'
import { cancelOperationOf } from '../src/sources.ts'
import { LEGAL_TENANT, OTHER_TENANT, PARENT, PEER, TENANT, dispatchOf } from './world.ts'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')

describe('the starting input of a dispatched session', () => {
  const work = dispatchOf({ instruction: 'Count the files.', expectation: 'One number.' })

  it('says that nobody attends, how the one report goes back, who dispatched, and the work with the hoped shape', () => {
    expect(instructionText(work)).toBe(
      [
        'Another agent dispatched one piece of work to you. Nobody attends this session: do the work with what you have, and do not ask a person.',
        'When the work is done, hand back one report with the command `report` of the tool `Agents`. There is one report for this work. If your turn ends without it, your last reply is taken as the report.',
        `Dispatching session: ${PARENT}\nDispatch: ${work.id}`,
        'Work:\nCount the files.\n\nThe shape the dispatcher hopes the report has:\nOne number.',
      ].join('\n\n'),
    )
  })

  it('leaves the hoped shape out when the dispatcher gave none', () => {
    const text = instructionText({ ...work, mode: 'spawn', expectation: null })
    expect(text.endsWith('Work:\nCount the files.')).toBe(true)
    expect(text).not.toContain('hopes')
  })

  it('says of a handoff that the work is the session’s own, with no report and a person attending', () => {
    expect(instructionText({ ...work, mode: 'handoff' })).toBe(
      [
        'Another agent handed this work over to this session. The work is yours from here: there is no report to hand back, and a person attends this session.',
        `Session it came from: ${PARENT}`,
        'Handover note:\nCount the files.',
      ].join('\n\n'),
    )
  })
})

describe('the report and the message put into a session', () => {
  it('words a late report with the session and the definition it came from', () => {
    expect(reportText({ session: PEER, agent: 'helper' }, 'All done.')).toBe(
      [
        'The report of work you dispatched arrived after your call stopped waiting for it. This is the one report of that dispatch.',
        `From session: ${PEER}\nAgent definition: helper`,
        'Report:\nAll done.',
      ].join('\n\n'),
    )
    expect(reportText({ session: PEER, agent: null }, 'x')).toContain('Agent definition: unknown\n')
  })

  it('words a message with what the sending session is to the receiving one', () => {
    expect(messageText({ session: PEER, agent: 'helper' }, 'child', 'Hello.')).toBe(
      [
        'A message from the agent of another session. It is not a report and ends no dispatch. Answer it with the command `message` of the tool `Agents`, if an answer is needed. Then end your turn with one short line of what you did with it: a turn cannot end with no reply.',
        `From session: ${PEER}\nAgent definition: helper\nWhat that session is to yours: child`,
        'Message:\nHello.',
      ].join('\n\n'),
    )
    expect(messageText({ session: PEER, agent: null }, null, 'x')).toContain(
      'Agent definition: unknown\nWhat that session is to yours: unknown\n',
    )
  })

  it('makes one system reminder whose identities come from the identity of the input', () => {
    const input = 'inp_1' as InputId
    const id = sha(`dispatch-session/1:message/${input}`)
    expect(reminderInput('report', input, 'the text')).toEqual({
      kind: 'ordinary',
      input,
      message: {
        id: `msg_${id.slice(0, 40)}`,
        role: 'system_reminder',
        blocks: [
          {
            kind: 'text',
            id: `blk_${id.slice(0, 32)}`,
            visibility: { toHuman: true, toModel: true },
            text: 'the text',
          },
        ],
      },
      origin: {
        owner: '@omne-harness/dispatch-session',
        record: input,
        revision: '1',
        digest: `sha256:${id}`,
      },
      source: DISPATCH_SOURCES.report,
    })
    expect(reminderInput('instruction', input, 'x').source).toBe('dispatch.instruction')
  })
})

describe('what dispatch registers with Session and derives for it', () => {
  it('declares three sources that accept the system component it is given and always wake the session', () => {
    const accepts = { subject: 'system', component: 'dispatch', screened: false }
    expect(dispatchInputSources('dispatch')).toEqual([
      { name: 'dispatch.instruction', label: 'Dispatched work', accepts, wake: 'always' },
      { name: 'dispatch.report', label: 'Dispatch report', accepts, wake: 'always' },
      { name: 'dispatch.message', label: 'Agent message', accepts, wake: 'always' },
    ])
  })

  it('derives the operation that stops a dispatched run from the tenant and the session, and from nothing else', () => {
    const parts = ['dispatch-session/1:cancel-start', TENANT, PARENT]
    expect(cancelOperationOf(LEGAL_TENANT, PARENT as never)).toBe(
      `sop_${sha(JSON.stringify(parts))}`,
    )
    expect(cancelOperationOf(LEGAL_TENANT, PEER as never)).not.toBe(
      cancelOperationOf(LEGAL_TENANT, PARENT as never),
    )
  })

  it('refuses to name the session of a dispatch whose tenant text is no tenant', () => {
    expect(() => sessionOfDispatch(OTHER_TENANT, dispatchOf().id)).toThrow(
      new TypeError('the tenant of a dispatch is not a tenant'),
    )
  })
})
