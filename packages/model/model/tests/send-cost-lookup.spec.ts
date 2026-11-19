import { describe, expect, it } from 'vitest'
import { MODEL_SEND, type CostLookupAnswer } from '@omne-harness/model-contract/provider'
import { createCostLookup } from '../src/send/cost-lookup.ts'
import type { ModelSendBoundaryOptions } from '../src/send/types.ts'

const SUPPLIER = { provider: 'gateway', credential: 'tenant' }
const RECORD = {
  dispatch: 'mdisp_one',
  supplier: SUPPLIER,
  request: 'gen-1',
}
const INPUT = { principal: 'p', tenant: 't', call: 'mcall_one', dispatch: 'mdisp_one' }
const FOUND: CostLookupAnswer = { kind: 'found', cost: [], place: 'openrouter' }

/** The lookup over scripted records, credentials and resources; `asked` keeps what reached them. */
function lookupOver(
  given: Readonly<{
    records?: readonly unknown[] | 'unavailable'
    secrets?: 'denied'
    lookup?: 'absent' | 'throws'
  }> = {},
) {
  const asked: { resolved: unknown[]; looked: unknown[] } = { resolved: [], looked: [] }
  const options = {
    commands: {
      dispatches: () =>
        Promise.resolve(
          given.records === 'unavailable'
            ? { failure: { kind: 'unavailable' } }
            : { ok: given.records ?? [RECORD] },
        ),
    },
    credentials: {
      resolve: (input: unknown) => {
        asked.resolved.push(input)
        return given.secrets === 'denied' ? { failure: { kind: 'denied' } } : { ok: 'secrets' }
      },
    },
    resources:
      given.lookup === 'absent'
        ? {}
        : {
            lookupCost: (input: unknown) => {
              asked.looked.push(input)
              if (given.lookup === 'throws') throw new Error('boom')
              return Promise.resolve(FOUND)
            },
          },
  } as unknown as ModelSendBoundaryOptions<string>
  const ask = () => createCostLookup(options)(INPUT as never, new AbortController().signal)
  return { ask, asked }
}

describe('the cost lookup of one dispatch through the send resources', () => {
  it('asks with the supplier, the request id and the credential layer the dispatch was sent with', async () => {
    const s = lookupOver()
    expect(await s.ask()).toEqual(FOUND)
    expect(s.asked.resolved).toEqual([
      {
        provider: 'gateway',
        layer: 'tenant',
        purpose: MODEL_SEND,
        access: { principal: 'p', tenant: 't' },
      },
    ])
    expect(s.asked.looked).toEqual([{ supplier: SUPPLIER, request: 'gen-1', secrets: 'secrets' }])
  })

  it('answers unsupported without resources that look up, or for a dispatch with no request id', async () => {
    expect(await lookupOver({ lookup: 'absent' }).ask()).toEqual({ kind: 'unsupported' })
    const unknown = lookupOver({ records: [{ ...RECORD, dispatch: 'mdisp_other' }] })
    expect(await unknown.ask()).toEqual({ kind: 'unsupported' })
    const anonymous = lookupOver({ records: [{ dispatch: 'mdisp_one', supplier: SUPPLIER }] })
    expect(await anonymous.ask()).toEqual({ kind: 'unsupported' })
    expect(anonymous.asked.resolved).toEqual([])
  })

  it('answers unavailable, which does not count, when the records, the credential or the lookup fail', async () => {
    expect(await lookupOver({ records: 'unavailable' }).ask()).toEqual({
      kind: 'unavailable',
      diagnostic: 'records-unavailable',
    })
    const denied = lookupOver({ secrets: 'denied' })
    expect(await denied.ask()).toEqual({ kind: 'unavailable', diagnostic: 'credential-denied' })
    expect(denied.asked.looked).toEqual([])
    expect(await lookupOver({ lookup: 'throws' }).ask()).toEqual({
      kind: 'unavailable',
      diagnostic: 'lookup-threw',
    })
  })
})
