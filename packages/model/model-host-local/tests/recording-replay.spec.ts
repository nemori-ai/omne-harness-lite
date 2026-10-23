// @module-tag slow — starts openssl child processes and real local HTTPS servers, writes vault
// files, and drives Model calls through the assembled send path.
//
// The gate: the four real recordings replayed through the assembled local path, without network
// and without a key. For each recording the request is rebuilt (a continued round from the replay
// of its first round), sent through the vault, the send fence, the pi transport and the family to
// a local HTTPS server that answers with the recorded body, and the call is checked end to end:
// the facts, the dispatch with its receipt and the account that reached ModelCommands.
import { describe, expect, it } from 'vitest'
import { payableAmount } from '@omne-harness/call-account'
import type { FixedModelRequest, TransportFact } from '@omne-harness/model-contract'
import { PLACEHOLDER } from './support/local-host.ts'
import {
  continuedRequest,
  firstRoundRequest,
  RECORD_CASE_NAMES,
  RECORD_CASES,
  type RecordCaseName,
} from './support/recording-cases.ts'
import type { FamilyName } from './support/records.ts'
import { acknowledgeAndClean, onlyDispatch, openReplay } from './support/replay.ts'

/** The replay format of the receipt, per family. */
const FORMATS: Readonly<Record<FamilyName, string>> = {
  'pi-ai-openai': 'openai-responses-v1',
  'pi-ai-anthropic': 'anthropic-claude-v1',
}

const labelOf = (name: string) => name.replace(/[^a-z0-9]/gu, '-')

/**
 * The request of a recording. A first round has its own request. A continued round continues
 * the replay of its first round, which settles, is read and goes into the next request.
 */
async function requestOf(name: RecordCaseName): Promise<FixedModelRequest> {
  const item = RECORD_CASES[name]
  if (item.round.kind === 'first') return firstRoundRequest(item)
  const first = firstRoundRequest(RECORD_CASES[item.round.first])
  const opened = await openReplay({
    request: first,
    name: item.round.first,
    label: `first-of-${labelOf(name)}`,
  })
  try {
    expect(opened.driven).toEqual({ ok: undefined })
    const blocks = await opened.readBlocks()
    const record = await onlyDispatch(opened.local)
    await acknowledgeAndClean(opened)
    return continuedRequest({ first, replayed: { blocks, record } })
  } finally {
    await opened.close()
  }
}

describe('each real recording replays through the assembled local path', () => {
  it.each(RECORD_CASE_NAMES)(
    '%s: the call settles with one termination and a reasoning state, and the account reaches ModelCommands',
    async name => {
      const item = RECORD_CASES[name]
      const request = await requestOf(name)
      const opened = await openReplay({ request, name, label: `gate-${labelOf(name)}` })
      try {
        const { local, note } = opened
        expect(note.model).toBe(item.model)
        expect(opened.driven).toEqual({ ok: undefined })

        // The request carried the credential the custodian resolved, inside the send fence.
        expect(opened.requests).toHaveLength(1)
        expect(opened.requests[0]?.headers.authorization).toBe(`Bearer ${PLACEHOLDER}`)

        // The facts end with exactly one termination, a completed one, and hold a reasoning state.
        const ended = local.facts.filter(
          (fact): fact is Extract<TransportFact, { kind: 'ended' }> => fact.kind === 'ended',
        )
        expect(ended).toHaveLength(1)
        expect(local.facts.at(-1)?.kind).toBe('ended')
        expect(ended[0]?.termination).toEqual({ kind: 'completed', reason: 'stop' })
        expect(
          local.facts.some(
            fact => fact.kind === 'block-seal' && fact.block.kind === 'reasoning_state',
          ),
        ).toBe(true)

        // The dispatch keeps the termination of the stream, the receipt and the account.
        const record = await onlyDispatch(local)
        expect(record.terminal).toEqual(ended[0]?.termination)
        const receipt = record.materialization?.receipt
        expect(receipt?.replayFormat).toBe(FORMATS[item.family])
        // The request is reproducible: this materialization sent the recorded request body.
        expect(receipt?.payloadDigest).toBe(note.payloadDigest)

        // The account came through the real path: ModelCommands completed it with this call
        // and the receipt. The cost is the gateway's, billable, with a known amount.
        const reported = local.facts.filter(fact => fact.kind === 'account')
        expect(reported).toHaveLength(1)
        expect(record.account).toEqual({
          ...reported[0]?.value,
          subject: { kind: 'model_call', id: local.call },
          receipt: 'received',
        })
        const billable = record.account?.cost.filter(cost => cost.source === 'billable') ?? []
        expect(billable).toHaveLength(1)
        expect(billable[0]).toMatchObject({ state: 'known', unit: 'openrouter-credit' })
        const payable = payableAmount(record.account)
        expect(payable).toMatchObject({ ok: { state: 'known', unit: 'openrouter-credit' } })
        expect(payable).toEqual({
          ok: {
            state: 'known',
            lexeme: Reflect.get(Object(billable[0]), 'lexeme'),
            unit: 'openrouter-credit',
          },
        })

        // The secret entered neither the facts nor the kept records.
        expect(JSON.stringify(local.facts)).not.toContain(PLACEHOLDER)
        expect(JSON.stringify(record)).not.toContain(PLACEHOLDER)
      } finally {
        await opened.close()
      }
    },
  )
})
