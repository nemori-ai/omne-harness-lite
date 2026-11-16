// @module-tag slow
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { standingPrincipalRef } from '@omne-harness/identity'
import type { HumanInterventionCardItem } from '@omne-harness/human-intervention-protocol'
import type { TenantId } from '@omne-harness/legal-identity'
import { runOmne, savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  originOf,
  pageLimit,
  protocolClients,
  sessionRef,
  tenantOf,
  type ProtocolClients,
} from '../../support/protocol-clients.ts'
import { onReleaseTree, toolCallsThenText, type ReleaseTree } from '../../support/release-tree.ts'

type HitlCardItem = HumanInterventionCardItem
type Hitl = ProtocolClients['humanIntervention']
type CardRef = Parameters<Hitl['read-card']>[0]['card']

const ASK = JSON.stringify({
  command: 'ask',
  params: {
    questions: [
      {
        title: 'Which port should the dev server use?',
        description: 'Port 8080 is in use by another process on this machine.',
        options: [
          { label: '8081 (Recommended)', description: 'The next free port.' },
          { label: '3000', description: 'The default port of the framework.' },
        ],
      },
      {
        title: 'Should the server reload on every file change?',
        description: 'Reloading is fast but restarts open connections.',
        options: [
          { label: 'Yes', description: 'Reload on every change.' },
          { label: 'No', description: 'Reload by hand.' },
        ],
      },
    ],
  },
})
const options = {
  script: toolCallsThenText(() => [{ id: 'call_ask', tool: 'Ask', arguments: ASK }]),
  permission: 'bypass-permissions',
}

const hitlAs = (world: ReleaseTree, proof: string, tenantText: string): Hitl =>
  protocolClients(originOf(world.port), () => ({ proof, tenant: tenantText })).humanIntervention

const listCards = (hitl: Hitl, tenantText: string, session?: string) =>
  hitl['list-cards']({
    tenant: tenantOf(tenantText),
    filter: {
      states: ['pending'],
      ...(session === undefined ? {} : { sessionRef: sessionRef(session) }),
    },
    cursor: null,
    limit: pageLimit(20),
  })

const readCard = (hitl: Hitl, tenantText: string, card: CardRef) =>
  hitl['read-card']({ tenant: tenantOf(tenantText), card })

function itemsOf(answer: Awaited<ReturnType<typeof listCards>>): readonly HitlCardItem[] {
  return answer.outcome === 'succeeded' ? answer.body.items : []
}

describe('the HITL location on the release tree (slice 02b)', () => {
  it(
    'two logins of the tenant list and read the cards of an Ask; the denied answers are the same bytes; only the tenant answers',
    { timeout: 240_000 },
    async () => {
      await onReleaseTree(options, async world => {
        const first = savedLoginProof(world.home)
        const tenantText = savedTenant(world.home)
        const tenant = tenantOf(tenantText)
        const session = await world.startSession('start: ask me')

        let asked: readonly HitlCardItem[] = []
        for (const end = Date.now() + 120_000; Date.now() < end; await sleep(500)) {
          asked = itemsOf(await listCards(hitlAs(world, first, tenantText), tenantText, session))
          if (asked.length === 2) break
        }
        expect(asked.map(item => [item.card.question.title, item.origin])).toEqual([
          [
            'Which port should the dev server use?',
            expect.objectContaining({ kind: 'tool', sessionRef: session }),
          ],
          [
            'Should the server reload on every file change?',
            expect.objectContaining({ kind: 'tool', sessionRef: session }),
          ],
        ])
        expect(asked.every(item => item.card.kind === 'pending')).toBe(true)

        const second = await world.relogin()
        expect(second).not.toBe(first)
        for (const proof of [first, second]) {
          const hitl = hitlAs(world, proof, tenantText)
          const bySession = await listCards(hitl, tenantText, session)
          const pool = await listCards(hitl, tenantText)
          expect([bySession.outcome, pool.outcome]).toEqual(['succeeded', 'succeeded'])
          expect(itemsOf(bySession)).toEqual(asked)
          expect(itemsOf(pool)).toEqual(asked)
          for (const item of asked)
            expect(await readCard(hitl, tenantText, item.card.ref)).toMatchObject({
              outcome: 'succeeded',
              body: { item },
            })
        }

        expect(
          await listCards(hitlAs(world, second, tenantText), tenantText, session),
        ).toMatchObject({ outcome: 'succeeded', body: { items: asked } })

        const otherHome = join(world.home, '..', 'other-home')
        const other = (args: readonly string[], credential?: string) =>
          runOmne({
            args: [...args],
            home: otherHome,
            server: `http://127.0.0.1:${String(world.port)}`,
            cwd: join(world.home, '..'),
            ...(credential === undefined ? {} : { credential }),
          })
        const otherCredential = 'fay-pw-release-hitl-38c1'
        for (const step of [
          await other(['register', '--login-identifier', 'fay'], otherCredential),
          await other(['login', '--login-identifier', 'fay'], otherCredential),
        ])
          expect(step.status, step.stderr).toBe(0)
        const otherProof = savedLoginProof(otherHome)
        const otherTenantText = savedTenant(otherHome)
        const otherTenant = tenantOf(otherTenantText)
        expect(otherTenant).not.toEqual(tenant)
        const otherHitl = hitlAs(world, otherProof, otherTenantText)
        const fresh = await listCards(otherHitl, otherTenantText)
        expect(fresh.outcome).toBe('succeeded')
        expect(itemsOf(fresh)).toEqual([])
        const beforeDomain = await readCard(otherHitl, otherTenantText, asked[0]!.card.ref)
        const created = await other(['create-session', '--definition', 'coding'])
        expect(created.status, created.stderr).toBe(0)

        const card = asked[0]!.card.ref
        const invalidProof = `${first.slice(0, -4)}AAAA`
        const missing: CardRef = {
          request: { tenantRef: card.request.tenantRef, requestId: 'no-such-request' },
          cardId: card.cardId,
        }
        const denied = [
          await readCard(hitlAs(world, otherProof, tenantText), tenantText, card),
          await readCard(otherHitl, otherTenantText, card),
          await readCard(hitlAs(world, invalidProof, tenantText), tenantText, card),
          await readCard(hitlAs(world, second, tenantText), tenantText, missing),
          beforeDomain,
        ]
        expect(denied[0]).toMatchObject({ outcome: 'denied' })
        for (const answer of denied.slice(1))
          expect(JSON.stringify(answer)).toBe(JSON.stringify(denied[0]))
        expect(itemsOf(await listCards(otherHitl, otherTenantText))).toEqual([])

        const notMemberText = JSON.stringify({
          organization: (JSON.parse(otherTenantText) as { organization: string }).organization,
          account: (JSON.parse(tenantText) as { account: string }).account,
        })
        const outside = await listCards(hitlAs(world, second, notMemberText), notMemberText)
        expect(JSON.stringify(outside)).toBe(JSON.stringify(denied[0]))

        const submission = (target: TenantId) =>
          ({
            tenant: target,
            card,
            expectedRevision: asked[0]!.card.revision,
            reply: { kind: 'decline' },
            replyId: 'reply-1',
          }) as const
        const refused = [
          [otherProof, tenantText, 'submit-reply'],
          [otherProof, tenantText, 'query-submit-reply'],
          [otherProof, otherTenantText, 'submit-reply'],
          [invalidProof, tenantText, 'submit-reply'],
          [invalidProof, tenantText, 'query-submit-reply'],
        ] as const
        for (const [proof, target, operation] of refused) {
          const answer = await hitlAs(world, proof, target)[operation](submission(tenantOf(target)))
          expect(JSON.stringify(answer), operation).toBe(JSON.stringify(denied[0]))
        }
        const ownQuery = await otherHitl['query-submit-reply'](submission(otherTenant))
        expect(ownQuery).toMatchObject({ outcome: 'unknown' })
        const at = await world.hitl.host?.tenant(savedTenant(world.home))
        if (at?.kind !== 'ready') throw new Error('no HITL application')
        const byOwner = await at.tenant.application.submitReply(world.registrar().principal, {
          protocol: 'hitl/1',
          operation: {
            tenantRef: savedTenant(world.home),
            actorRef: standingPrincipalRef(world.registrar().principal),
            operationId: 'owner-reply-1',
          },
          cardRef: card,
          expectedRevision: asked[0]!.card.revision,
          reply: { kind: 'decline' },
        } as never)
        expect(['decided', 'already-decided']).not.toContain(byOwner.kind)
        expect(itemsOf(await listCards(hitlAs(world, second, tenantText), tenantText))).toEqual(
          asked,
        )
      })
    },
  )
})
