import { afterEach, expect, it } from 'vitest'
import type { FrameSource } from '@omne-harness/access-cordis-contract'
import { createObservationHub } from '../src/observation-hub/hub.ts'
import type { Entered } from '../src/registry/registry.ts'
import { holdResponse, type HeldResponse } from './support/held-response.ts'
import { manualClock } from './support/manual-clock.ts'
import { pipelineNotesProtocol } from './support/test-contribution.ts'

const contract = pipelineNotesProtocol().observations['watch-note']
const LIMITS = {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 1_024,
  maxMembers: 64,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}

const responses: HeldResponse[] = []
afterEach(async () => {
  await Promise.all(responses.splice(0).map(held => held.dispose()))
})

it.each([
  ['the caller said 1', 1, 1],
  ['the caller said nothing', undefined, 2],
])(
  'the source is told the revision the frames are written at, with a protocol at 2: %s',
  async (_name, claimed, told) => {
    const held = await holdResponse()
    responses.push(held)
    const seen: number[] = []
    const source = (async context => {
      seen.push(context.revision)
      return { outcome: 'basis-unavailable' }
    }) as FrameSource<never>
    const hub = createObservationHub({
      limits: { perLogin: 8, perInstance: 8 },
      heartbeatMs: 1_000_000_000,
      loginCheckIntervalMs: 1_000_000_000,
      frameQueueBytes: 1 << 20,
      graceMs: 1000,
      clock: manualClock(),
      writeLimits: LIMITS,
    })
    const entered = {
      member: { kind: 'observation', contract, source },
      revision: 2,
      signal: new AbortController().signal,
      leave: () => {},
    } as unknown as Entered
    await hub.open({
      entered,
      contract,
      source: source as never,
      principal: {},
      messageId: 'm-1',
      ...(claimed !== undefined && { revision: claimed }),
      open: { noteId: 'n-1' },
      key: 'k',
      note: () => {},
      res: held.res,
    })
    expect(seen).toEqual([told])
  },
)
