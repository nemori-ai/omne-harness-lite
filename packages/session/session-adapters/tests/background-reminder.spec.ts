import { describe, expect, it } from 'vitest'
import type { ContentBlock } from '@omne-harness/content-block'
import type { Effect, ToolCallId, ToolDelivery, ToolTerminal } from '@omne-harness/tool-contract'
import { decodeToolDeliveryId, decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import { backgroundReminder } from '../src/cordis/background-reminder.ts'
import { evidence, ok } from './fixtures/common-journal.ts'

type Result = Extract<ToolDelivery<ContentBlock>, { kind: 'result' }>

const CALL = 'tcall_bg' as ToolCallId
const VISIBLE = { toHuman: true, toModel: true }
const block = (id: string, text: string, kind: 'text' | 'thinking' = 'text', toModel = true) =>
  ({ kind, id, visibility: { toHuman: true, toModel }, text }) as ContentBlock

function delivery(
  change: Partial<Pick<Result, 'terminal' | 'effect'>> & Partial<Result['value']> = {},
  version = 'rv-1',
): Result {
  const { terminal, effect, ...value } = change
  return {
    kind: 'result',
    key: {
      kind: 'result',
      producer: 'tool',
      reference: 'ref' as never,
      result: ok(decodeToolResultVersion(version)),
    },
    consumer: { owner: 'consumer', work: 'work', position: 'p', purpose: 'action' },
    delivery: ok(decodeToolDeliveryId('d1')),
    relation: 'original',
    terminal: terminal ?? { kind: 'completed' },
    actualTerminal: null,
    effect: effect ?? { kind: 'occurred', evidence: evidence('effect') },
    source: evidence('result'),
    value: {
      content: [block('blk_out', 'done')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
      ...value,
    } as Result['value'],
    account: null,
  }
}

const head = (result: Result) => {
  const [first] = backgroundReminder(CALL, result).blocks
  return (first as { text: string }).text
}

describe('the reminder a backgrounded outcome becomes', () => {
  it('names the call, the terminal and the effect in its first block', () => {
    const terminals: readonly (readonly [ToolTerminal, string])[] = [
      [{ kind: 'completed' }, `The background call ${CALL} completed;`],
      [{ kind: 'failed', cause: 'executor', diagnostic: 'exit 2' }, 'failed (executor): exit 2;'],
      [{ kind: 'unavailable', reason: 'no shell' }, 'was unavailable: no shell;'],
      [
        { kind: 'interrupted', cause: { kind: 'foreground-limit' } },
        'was interrupted (foreground-limit);',
      ],
      [
        { kind: 'no-response', wait: 'w' as never, reason: 'nobody' },
        'ended without a response: nobody;',
      ],
    ]
    for (const [terminal, text] of terminals) expect(head(delivery({ terminal }))).toContain(text)
    const effects: readonly (readonly [Effect, string])[] = [
      [{ kind: 'not-started' }, 'it did not start.'],
      [{ kind: 'not-occurred', evidence: evidence('e') }, 'no effect occurred.'],
      [{ kind: 'occurred', evidence: evidence('e') }, 'its effect occurred.'],
      [{ kind: 'unknown', diagnostic: 'lost' }, 'whether it had an effect is unknown (lost).'],
    ]
    for (const [effect, text] of effects) expect(head(delivery({ effect }))).toContain(text)
  })

  it('carries only the model-visible content, then the summary of an offloaded output', () => {
    const message = backgroundReminder(
      CALL,
      delivery({
        content: [
          block('blk_a', 'shown'),
          block('blk_t', 'hidden thought', 'thinking'),
          block('blk_h', 'for humans', 'text', false),
        ],
        original: { kind: 'offloaded', summary: [block('blk_s', 'summary')] } as never,
        attachments: [{} as never, {} as never],
      }),
    )
    expect(message.role).toBe('system_reminder')
    expect(message.blocks.slice(1)).toEqual([block('blk_a', 'shown'), block('blk_s', 'summary')])
    const text = (message.blocks[0] as { text: string }).text
    expect(text).toContain(`The full output of call ${CALL} is kept with its result`)
    expect(text).toContain(`2 attachment(s) of call ${CALL} are kept with its result`)
    expect(head(delivery())).not.toContain('kept with its result')
    expect(message.blocks[0]).toMatchObject({ visibility: VISIBLE })
  })

  it('derives its identities from the call and the result version', () => {
    const one = backgroundReminder(CALL, delivery())
    expect(backgroundReminder(CALL, delivery())).toEqual(one)
    const other = backgroundReminder(CALL, delivery({}, 'rv-2'))
    expect(other.id).not.toBe(one.id)
    expect(other.blocks[0]!.id).not.toBe(one.blocks[0]!.id)
    expect(one.id).toMatch(/^msg_[A-Za-z0-9_-]{22,64}$/u)
  })
})
