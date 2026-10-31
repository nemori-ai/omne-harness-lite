import { decodeModelOperationId, decodeOutputCursor } from '@omne-harness/model-contract'
import type { OutputCursor, VisibleBlock } from '@omne-harness/model-contract'
import { judgePart } from '@omne-harness/message'
import { succeed } from '@omne-harness/operation-result'
import { describe, expect, it } from 'vitest'
import {
  failingObligations,
  failures,
  hooked,
  observedThrough,
  patched,
  type ObservationMap,
} from './conformance-support.ts'
import { evidence, must, textBlock } from './scripted-support.ts'

const zeroCursor = must(decodeOutputCursor('0'))

/** Changes the blocks of every snapshot that an observation carries. */
function reshaped(change: (block: VisibleBlock) => VisibleBlock): ObservationMap {
  return item =>
    item.kind === 'ended'
      ? item
      : { kind: item.kind, value: { ...item.value, blocks: item.value.blocks.map(change) } }
}

function toolCall() {
  const judged = judgePart({
    kind: 'tool_call',
    id: 'forced',
    visibility: { toHuman: false, toModel: true },
    callId: 'call-forced',
    name: 'lookup',
    arguments: { kind: 'null' },
  })
  if (!('ok' in judged) || judged.ok.kind !== 'tool_call') throw new Error('fixture tool call')
  return judged.ok
}

describe('the conformance suite on observation', () => {
  it('fails a provider whose first observation is a change', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position) =>
          position === 0 && item.kind === 'snapshot'
            ? { kind: 'changed', value: item.value }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['observation-opens-with-snapshot'])
    expect(reasons).toEqual([expect.stringContaining('the first observation is not a snapshot')])
  })

  it('fails a provider whose cursor goes back', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position) =>
          position > 0 && item.kind === 'changed'
            ? { kind: 'changed', value: { ...item.value, cursor: zeroCursor } }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['observation-opens-with-snapshot'])
    expect(reasons).toEqual([expect.stringContaining('the cursor went back from 1 to 0')])
  })

  it('fails a provider that cancels the call when its observation is closed', async () => {
    const { failing, reasons } = await failures(subject => {
      const { calls } = subject.provider.runtime
      return patched(subject, {
        instances: observedThrough(async (item, _position, access) => {
          if (item.kind === 'ended' && item.reason === 'observer-closed')
            await calls.cancel({
              ...access,
              operation: must(decodeModelOperationId('mop_close-cancels')),
            })
          return item
        }),
      })
    })
    expect(failing).toEqual(['stopping-observation-keeps-call-running'])
    expect(reasons).toEqual([
      expect.stringContaining('closing the observation asked for a control'),
    ])
  })

  it('fails a provider that reports a cut connection as a closed observation', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(item =>
          item.kind === 'ended' && item.reason === 'unavailable'
            ? { kind: 'ended', reason: 'observer-closed' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['disconnect-ends-observation-as-unavailable'])
    expect(reasons).toEqual([
      expect.stringContaining('the cut observation ended as observer-closed'),
    ])
  })

  it('fails a provider whose snapshot of a running call shows it as consumed', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(item => {
          if (item.kind === 'ended') return item
          const custody = {
            kind: 'acknowledged',
            operation: must(decodeModelOperationId('mop_consumed')),
            receipt: evidence('consumed'),
            cleanup: 'pending',
            diagnostic: null,
          } as const
          return {
            kind: item.kind,
            value: { ...item.value, state: { ...item.value.state, custody } },
          }
        }),
      }),
    )
    expect(failing).toEqual(['new-observer-starts-from-snapshot'])
    expect(reasons).toEqual([
      expect.stringContaining('the snapshot of a running call shows the custody'),
    ])
  })

  it('fails a provider whose growing block shows only the last fragment', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(
          reshaped(block =>
            block.kind === 'growing' ? { ...block, value: block.value.slice(-1) } : block,
          ),
        ),
      }),
    )
    expect(failing).toEqual(['growing-block-holds-accumulated-value'])
    expect(reasons).toEqual([expect.stringContaining('the appended block shows')])
  })

  it('fails a provider that fills a block after it was sealed', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(
          reshaped(block =>
            block.kind === 'sealed' && block.block.kind === 'text'
              ? {
                  kind: 'growing',
                  index: block.index,
                  mode: 'append',
                  content: 'text',
                  value: `${block.block.text}c`,
                }
              : block,
          ),
        ),
      }),
    )
    expect(failing).toEqual(['sealed-block-takes-no-more-fill'])
    expect(reasons).toEqual([expect.stringContaining('the sealed block shows')])
  })

  it('fails a provider that turns arguments that are still arriving into a tool suggestion', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(
          reshaped(block =>
            block.kind === 'growing' && block.content === 'tool-arguments'
              ? { kind: 'sealed', index: block.index, block: toolCall() }
              : block,
          ),
        ),
      }),
    )
    expect(failing).toEqual(['unsealed-tool-arguments-not-executable'])
    expect(reasons).toEqual([
      expect.stringContaining('arguments that are still arriving became a tool suggestion'),
    ])
  })
})

describe('the conformance suite on a provider whose observations end too early', () => {
  it('names the first observation of every check when each observation ends first', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position) =>
          position === 0 ? { kind: 'ended', reason: 'unavailable' } : item,
        ),
      }),
    )
    expect(failing).toEqual([
      'observation-opens-with-snapshot',
      'stopping-observation-keeps-call-running',
      'disconnect-ends-observation-as-unavailable',
      'new-observer-starts-from-snapshot',
      'growing-block-holds-accumulated-value',
      'sealed-block-takes-no-more-fill',
      'unsealed-tool-arguments-not-executable',
      'revoked-principal-observation-ends-denied',
      'replaced-instance-ends-observation-as-stale',
    ])
    expect(new Set(reasons)).toEqual(
      new Set([expect.stringMatching(/^the first observation is not a snapshot: /u)]),
    )
  })

  it('names the observation of the cut-off arguments when only that one ends first', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position, access) =>
          position === 0 && access.call.includes('tool-cut')
            ? { kind: 'ended', reason: 'unavailable' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['unsealed-tool-arguments-not-executable'])
    expect(reasons).toEqual([expect.stringMatching(/^the first observation is not a snapshot: /u)])
  })

  it('names the observation that finished without an end when each stream stops after its first item', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: directory => ({
          async connect(access) {
            const route = await directory.connect(access)
            if ('failure' in route || route.ok.kind !== 'live') return route
            const { handle } = route.ok
            return succeed({
              kind: 'live',
              handle: {
                instance: handle.instance,
                observe: input =>
                  (async function* () {
                    for await (const item of handle.observe(input)) {
                      yield item
                      return
                    }
                  })(),
              },
            })
          },
        }),
      }),
    )
    expect(failing).toEqual([
      'observation-opens-with-snapshot',
      'stopping-observation-keeps-call-running',
      'disconnect-ends-observation-as-unavailable',
      'revoked-principal-observation-ends-denied',
      'replaced-instance-ends-observation-as-stale',
    ])
    expect(reasons).toEqual([
      expect.stringMatching(/^the observation after a change is not a changed snapshot: /u),
      'the observation after the abort finished without an ended item',
      'the observation after the disconnect finished without an ended item',
      'the observation after the revoke finished without an ended item',
      'the observation after the replacement finished without an ended item',
    ])
  })
})

describe('the conformance suite on the other ways that observation can go wrong', () => {
  it('keeps a provider whose change carries the same cursor as the snapshot before it', async () => {
    const failing = await failingObligations(subject => {
      let opening: OutputCursor | undefined
      return patched(subject, {
        instances: observedThrough((item, position) => {
          if (position === 0 && item.kind === 'snapshot') opening = item.value.cursor
          return item.kind === 'changed' && opening !== undefined
            ? { kind: 'changed', value: { ...item.value, cursor: opening } }
            : item
        }),
      })
    })
    expect(failing).toEqual([])
  })

  it('fails a provider that reports a closed observation as cut', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(item =>
          item.kind === 'ended' && item.reason === 'observer-closed'
            ? { kind: 'ended', reason: 'unavailable' }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['stopping-observation-keeps-call-running'])
    expect(reasons[0]).toBe('the aborted observation ended as unavailable')
  })

  it('fails a provider whose disconnect ends the call', async () => {
    const { failing, reasons } = await failures(subject => {
      const { hooks } = subject
      const disconnect = hooks?.disconnectObservers
      const settle = hooks?.settleCall
      if (disconnect === undefined || settle === undefined)
        throw new Error('the scripted subject has disconnectObservers and settleCall')
      return {
        ...subject,
        hooks: {
          ...hooks,
          disconnectObservers: async input => {
            await disconnect(input)
            await settle({
              ...input,
              termination: { kind: 'completed', reason: 'stop' },
              parts: [].map(block => ({ kind: 'sealed' as const, block, trims: [] })),
              pageSize: 1,
              pageTargetBytes: 1024,
            })
          },
        },
      }
    })
    expect(failing).toEqual(['disconnect-ends-observation-as-unavailable'])
    expect(reasons[0]).toContain('the disconnect ended the call')
  })

  it('fails a provider that gives a snapshot where a change is due', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough((item, position) =>
          position === 1 && item.kind === 'changed'
            ? { kind: 'snapshot', value: item.value }
            : item,
        ),
      }),
    )
    expect(failing).toEqual(['observation-opens-with-snapshot'])
    expect(reasons[0]).toContain('is not a changed snapshot')
  })

  it('fails a provider that stops the run when its observation is closed', async () => {
    const { failing, reasons } = await failures(subject => {
      const settle = subject.hooks?.settleCall
      if (settle === undefined) throw new Error('the scripted subject has settleCall')
      return patched(subject, {
        instances: observedThrough(async (item, _position, access) => {
          if (item.kind === 'ended' && item.reason === 'observer-closed')
            await settle({
              tenant: access.tenant,
              call: access.call,
              termination: { kind: 'completed', reason: 'stop' },
              parts: [].map(block => ({ kind: 'sealed' as const, block, trims: [] })),
              pageSize: 1,
              pageTargetBytes: 1024,
            })
          return item
        }),
      })
    })
    expect(failing).toEqual(['stopping-observation-keeps-call-running'])
    expect(reasons[0]).toContain('closing the observation ended the run')
  })

  it('fails a provider whose snapshot of a running call shows another phase', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(item => {
          if (item.kind === 'ended') return item
          const { call, revision, consumer, control, custody } = item.value.state
          return {
            kind: item.kind,
            value: {
              ...item.value,
              state: { call, revision, consumer, control, custody, phase: 'accepted' },
            },
          }
        }),
      }),
    )
    expect(failing).toEqual(['new-observer-starts-from-snapshot'])
    expect(reasons[0]).toBe('the snapshot of a running call shows the phase accepted')
  })

  it('fails a provider whose snapshot leaves out the block in flight', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(item =>
          item.kind === 'ended'
            ? item
            : {
                kind: item.kind,
                value: {
                  ...item.value,
                  blocks: item.value.blocks.filter(block => block.kind !== 'growing'),
                },
              },
        ),
      }),
    )
    expect(failing).toEqual([
      'new-observer-starts-from-snapshot',
      'growing-block-holds-accumulated-value',
    ])
    expect(reasons[0]).toContain('the snapshot lacks the block in flight')
  })

  it('fails a provider whose appended block shows the replace mode', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(
          reshaped(block =>
            block.kind === 'growing' && block.mode === 'append'
              ? { ...block, mode: 'replace' }
              : block,
          ),
        ),
      }),
    )
    expect(failing).toEqual([
      'new-observer-starts-from-snapshot',
      'growing-block-holds-accumulated-value',
    ])
    expect(reasons[1]).toContain('the appended block shows')
  })

  it('fails a provider whose replaced block shows another value', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(
          reshaped(block =>
            block.kind === 'growing' && block.mode === 'replace' ? { ...block, value: 'x' } : block,
          ),
        ),
      }),
    )
    expect(failing).toEqual(['growing-block-holds-accumulated-value'])
    expect(reasons[0]).toContain('the replaced block shows')
  })

  it('fails a provider that takes a replace for an append', async () => {
    const { failing, reasons } = await failures(subject => {
      const held = new Map<string, string>()
      return hooked(subject, hooks => ({
        ...hooks,
        async showFacts(input) {
          const facts = input.facts.map(fact => {
            if (fact.kind !== 'block-replace') return fact
            const key = `${input.call}/${fact.index}`
            const value = `${held.get(key) ?? ''}${fact.value}`
            held.set(key, value)
            return { ...fact, value }
          })
          await hooks.showFacts?.({ ...input, facts })
        },
      }))
    })
    expect(failing).toEqual(['growing-block-holds-accumulated-value'])
    expect(reasons[0]).toContain('the replaced block shows')
  })

  it('fails a provider that swaps the content of a sealed block', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(
          reshaped(block =>
            block.kind === 'sealed' && block.block.kind === 'text'
              ? { ...block, block: textBlock('swapped', 'swapped') }
              : block,
          ),
        ),
      }),
    )
    expect(failing).toEqual(['sealed-block-takes-no-more-fill'])
    expect(reasons[0]).toContain('the sealed block shows')
  })

  it('fails a provider that seals arguments that a trim had cut off', async () => {
    const { failing, reasons } = await failures(subject =>
      patched(subject, {
        instances: observedThrough(
          reshaped(block =>
            block.kind === 'growing' &&
            block.content === 'tool-arguments' &&
            block.value === '{"a":1}'
              ? { kind: 'sealed', index: block.index, block: toolCall() }
              : block,
          ),
        ),
      }),
    )
    expect(failing).toEqual(['unsealed-tool-arguments-not-executable'])
    expect(reasons[0]).toContain('arguments that were cut off became a tool suggestion')
  })
})
