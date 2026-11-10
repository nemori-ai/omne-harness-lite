import { afterEach, expect, it, vi } from 'vitest'
import { createGovernanceLocal } from '@omne-harness/governance-local'
import { openSourceCoordinatorWorld } from './source-coordinator-world.ts'
import { openProviderWorld } from './provider-world.ts'

const worlds: Awaited<ReturnType<typeof openSourceCoordinatorWorld>>[] = []
afterEach(async () => {
  for (const world of worlds.splice(0)) await world.close()
})
it.each(['held', 'lost-reply', 'wrong-receipt'])(
  'retains actual Settings custody on %s and settles only the original request',
  async fault => {
    const w = await openSourceCoordinatorWorld()
    worlds.push(w)
    const { options } = await openProviderWorld(w.governance)
    const plan = vi.fn(() => {
      throw new Error('fixture business assembly unavailable')
    })
    const heldReplies: unknown[] = []
    const blockedWrites: unknown[] = []
    const made = await createGovernanceLocal({
      ...options,
      sourceReservations: {
        async reserve(context, request) {
          const reply = await w.service.reserve(context, request)
          heldReplies.push(reply)
          blockedWrites.push(await w.source.set(true, 0, 'during-external-write'))
          if (fault === 'lost-reply') throw new Error('fixture lost reserve acknowledgement')
          if (fault === 'wrong-receipt' && reply.kind === 'held')
            return {
              ...reply,
              request: {
                ...reply.request,
                destination: { ...reply.request.destination, attemptId: 'wrong-attempt' },
              },
            }
          return reply
        },
        settle: request => w.service.settle(request),
      },
      externalWrites: {
        sourceRoute: w.input.request.command.sourceRoute,
        principalOf: principal => principal,
        resolve: async () => ({
          kind: 'qualified',
          qualification: { fixture: 'source-bound-write' },
          required: [],
          source: w.input.request.command.source,
        }),
        plan,
      },
    })
    if (made.kind !== 'created' || made.externalWrites === undefined)
      throw new Error(JSON.stringify(made))
    const result = await made.externalWrites.execute(w.governance.principal, {
      operationId: 'external-settings-source',
      write: {
        owner: 'fixture.owner',
        protocol: 'fixture-source-write/1',
        targetRef: 'target',
        commandDigest: 'original',
        command: { pick: 'deny' },
      },
    })
    expect(result).toMatchObject({ kind: 'terminal', outcome: 'aborted' })
    expect(heldReplies).toMatchObject([{ kind: 'held' }])
    expect(blockedWrites).toMatchObject([{ kind: 'rejected' }])
    expect(plan).toHaveBeenCalledTimes(fault === 'held' ? 1 : 0)
    if (result.kind !== 'terminal') throw new Error('terminal expected')
    expect(await made.close()).toEqual({ kind: 'closed' })
    expect(await w.governance.services().sql.observe(result.binding)).toMatchObject({
      kind: 'found',
      standing: { kind: 'settled', outcome: 'aborted' },
      source: { kind: 'settled', outcome: 'aborted' },
    })
    expect(await w.source.set(true, 0, 'after-external-write')).toMatchObject({
      kind: 'committed',
      revision: 1,
    })
  },
)
