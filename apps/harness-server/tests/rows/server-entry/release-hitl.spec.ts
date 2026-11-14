// @module-tag slow
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { standingPrincipalRef } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { HitlCardItem, HitlCardRef, HitlRequest } from '@omne-harness/public-contract'
import { createHitlClient, createHttpTransport } from '@omne-harness/sdk'
import { runOmne, savedLoginProof, savedTenant } from '../../r9/support.ts'
import {
  hitlPublic,
  onReleaseTree,
  toolCallsThenText,
  type HitlExchange,
} from '../../support/release-tree.ts'

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

const tenantOf = (text: string): TenantId => {
  const parsed = tenantCodec.parse(text)
  if (!parsed.ok) throw new Error('the saved tenant does not parse')
  return parsed.value
}
const present = (value: string) => ({ kind: 'present', value }) as const

function listCards(
  proof: string,
  tenant: TenantId,
  sessionRef?: string,
): HitlRequest<'list-cards'> {
  return {
    protocolVersion: 'hitl-public/1',
    messageId: 'm-list',
    operation: 'list-cards',
    proof: present(proof),
    body: {
      tenant,
      filter: { states: ['pending'], ...(sessionRef === undefined ? {} : { sessionRef }) },
      cursor: null,
      limit: 20,
    },
  }
}

function readCard(proof: string, tenant: TenantId, card: HitlCardRef): HitlRequest<'read-card'> {
  return {
    protocolVersion: 'hitl-public/1',
    messageId: 'm-read',
    operation: 'read-card',
    proof: present(proof),
    body: { tenant, card },
  }
}

function itemsOf(exchange: HitlExchange) {
  const response = exchange.response
  if (response?.outcome !== 'succeeded') return []
  return (response.body as { items: readonly HitlCardItem[] }).items
}

describe('the HITL location on the release tree (slice 02b)', () => {
  it(
    'two logins of the tenant list and read the cards of an Ask; the denied answers are the same bytes; only the tenant answers',
    { timeout: 240_000 },
    async () => {
      await onReleaseTree(options, async world => {
        const first = savedLoginProof(world.home)
        const tenant = tenantOf(savedTenant(world.home))
        const session = await world.startSession('start: ask me')

        let asked: readonly HitlCardItem[] = []
        for (const end = Date.now() + 120_000; Date.now() < end; await sleep(500)) {
          asked = itemsOf(await hitlPublic(world.port, listCards(first, tenant, session)))
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
          const bySession = await hitlPublic(world.port, listCards(proof, tenant, session))
          const pool = await hitlPublic(world.port, listCards(proof, tenant))
          expect([bySession.status, pool.status]).toEqual([200, 200])
          expect(itemsOf(bySession)).toEqual(asked)
          expect(itemsOf(pool)).toEqual(asked)
          for (const item of asked) {
            const read = await hitlPublic(world.port, readCard(proof, tenant, item.card.ref))
            expect(read.status).toBe(200)
            expect(read.response).toMatchObject({ outcome: 'succeeded', body: { item } })
          }
        }

        const client = createHitlClient({
          transport: createHttpTransport({
            origin: `http://127.0.0.1:${String(world.port)}`,
            location: 'hitl',
          }),
        })
        expect(await client.submit(listCards(second, tenant, session))).toMatchObject({
          kind: 'response',
          message: { outcome: 'succeeded', body: { items: asked } },
        })

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
        const otherTenant = tenantOf(savedTenant(otherHome))
        expect(otherTenant).not.toEqual(tenant)
        const fresh = await hitlPublic(world.port, listCards(otherProof, otherTenant))
        expect(fresh.status).toBe(200)
        expect(itemsOf(fresh)).toEqual([])
        const beforeDomain = await hitlPublic(
          world.port,
          readCard(otherProof, otherTenant, asked[0]!.card.ref),
        )
        const created = await other(['create-session', '--definition', 'coding'])
        expect(created.status, created.stderr).toBe(0)

        const card = asked[0]!.card.ref
        const invalidProof = `${first.slice(0, -4)}AAAA`
        const missing: HitlCardRef = {
          request: { tenantRef: card.request.tenantRef, requestId: 'no-such-request' },
          cardId: card.cardId,
        }
        const denied = [
          await hitlPublic(world.port, readCard(otherProof, tenant, card)),
          await hitlPublic(world.port, readCard(otherProof, otherTenant, card)),
          await hitlPublic(world.port, readCard(invalidProof, tenant, card)),
          await hitlPublic(world.port, readCard(second, tenant, missing)),
          beforeDomain,
        ]
        expect(denied[0]?.response).toMatchObject({ outcome: 'denied', body: {} })
        expect(denied[0]?.status).toBe(403)
        for (const answer of denied.slice(1)) {
          expect(answer.status).toBe(denied[0]?.status)
          expect(answer.headers).toEqual(denied[0]?.headers)
          expect(answer.bytes).toBe(denied[0]?.bytes)
        }
        expect(itemsOf(await hitlPublic(world.port, listCards(otherProof, otherTenant)))).toEqual(
          [],
        )

        const notMember = tenantOf(
          JSON.stringify({
            organization: (JSON.parse(savedTenant(otherHome)) as { organization: string })
              .organization,
            account: (JSON.parse(savedTenant(world.home)) as { account: string }).account,
          }),
        )
        const outside = await hitlPublic(world.port, {
          ...listCards(second, notMember),
          messageId: 'm-read',
        })
        expect(outside.status).toBe(denied[0]?.status)
        expect(outside.headers).toEqual(denied[0]?.headers)
        expect(outside.bytes).toBe(denied[0]?.bytes)

        const submission = (target: TenantId) =>
          ({
            tenant: target,
            card,
            expectedRevision: asked[0]!.card.revision,
            reply: { kind: 'decline' },
            replyId: 'reply-1',
          }) as const
        const refused = [
          [otherProof, tenant, 'submit-reply'],
          [otherProof, tenant, 'query-submit-reply'],
          [otherProof, otherTenant, 'submit-reply'],
          [invalidProof, tenant, 'submit-reply'],
          [invalidProof, tenant, 'query-submit-reply'],
        ] as const
        for (const [proof, target, operation] of refused) {
          const answer = await hitlPublic(world.port, {
            protocolVersion: 'hitl-public/1',
            messageId: 'm-read',
            operation,
            proof: present(proof),
            body: submission(target),
          })
          expect(answer.status, operation).toBe(denied[0]?.status)
          expect(answer.bytes, operation).toBe(denied[0]?.bytes)
        }
        const ownQuery = await hitlPublic(world.port, {
          protocolVersion: 'hitl-public/1',
          messageId: 'm-own-query',
          operation: 'query-submit-reply',
          proof: present(otherProof),
          body: submission(otherTenant),
        })
        expect(ownQuery.response).toMatchObject({ outcome: 'unknown', body: {} })
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
        expect(itemsOf(await hitlPublic(world.port, listCards(second, tenant)))).toEqual(asked)
      })
    },
  )
})
