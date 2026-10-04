import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { DiagnosticRecord, DiagnosticScope } from '@omne-harness-lite/model-request-runtime'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment, publication, ROOT } from './model-request-support.ts'
import { createLocalTls } from './local-tls.ts'
import { activateModelFixture, actor, latch, ref } from './support.ts'

function user(label: string) {
  const result = judgeMessage({
    type: 'user',
    id: `d6-user-${label}`,
    createdAt: '2026-09-28T00:00:00Z',
    blocks: [
      {
        id: `d6-text-${label}`,
        kind: 'text',
        text: `d6 private prompt ${label}`,
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in result) || result.ok.type !== 'user') throw new Error('invalid D6 user')
  return result.ok
}

async function records(
  query: (input: {
    scope: DiagnosticScope
    after?: { collectorId: string; sequence: string }
    limit: number
    maxBytes: number
  }) => Promise<
    | {
        page: {
          records: readonly DiagnosticRecord[]
          next?: { collectorId: string; sequence: string }
        }
      }
    | { rejected: string }
  >,
  scope: DiagnosticScope,
): Promise<readonly DiagnosticRecord[]> {
  const rows: DiagnosticRecord[] = []
  let after: { collectorId: string; sequence: string } | undefined
  for (let page = 0; page < 32; page++) {
    const result = await query({
      scope,
      ...(after ? { after } : {}),
      limit: 128,
      maxBytes: 1_048_576,
    })
    if (!('page' in result)) throw new Error(`diagnostic query rejected: ${result.rejected}`)
    rows.push(...result.page.records)
    if (result.page.next === undefined) return rows
    after = result.page.next
  }
  throw new Error('diagnostic query exceeded bounded D6 pages')
}

describe('D6 application diagnostic closure', () => {
  it('preserves two concurrent service calls in one tenant journal without crossing session or local scopes', async () => {
    const config = await callDeployment('d6-completion-two-sessions')
    const firstEntered = latch()
    const releaseFirst = latch()
    let received = 0
    const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'), async () => {
      received++
      if (received === 1) {
        firstEntered.resolve()
        await releaseFirst.promise
      }
    })
    let revision = 0
    let disposeContribution: (() => Promise<void>) | undefined
    const app = createAcceptanceApplication(
      {
        ...config,
        modelRequest: {
          ...config.modelRequest,
          transport: {
            ...config.modelRequest.transport,
            policy: { ...config.modelRequest.transport.policy, maxConnections: 2 },
          },
          evaluationInputs: {
            ...config.modelRequest.evaluationInputs,
            async prepare(who) {
              const expectedRevision = revision === 0 ? null : String(revision)
              revision++
              return {
                publication: publication(who, expectedRevision),
                recipe: { rootDefinition: ROOT },
              }
            },
          },
        },
      },
      {
        stage: 'modelRequest',
        developmentTransport: tls.developmentTransport,
        diagnostics: { record() {} },
        hooks: {
          modelContributionCreated(_definition, fiber) {
            disposeContribution = () => fiber.dispose()
          },
        },
      },
    )
    const hosts = [createDemoCallHost(), createDemoCallHost()] as const
    let firstTask: ReturnType<typeof app.startServiceCall> | undefined
    let diagnostics: Awaited<ReturnType<typeof activateModelFixture>> | undefined
    try {
      await app.ready
      const who = await actor(app)
      diagnostics = await activateModelFixture(app, who, config)
      const prepared = await Promise.all([
        app.prepareSession(who, 'd6-session-first'),
        app.prepareSession(who, 'd6-session-second'),
      ])
      if (prepared.some(result => !('session' in result)))
        throw new Error('session preparation failed')
      const sessions = prepared.map(result => {
        if (!('session' in result)) throw new Error('session preparation failed')
        return result.session
      })
      for (const [index, session] of sessions.entries()) {
        expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
        expect(await app.selectModel(who, session, 'deepseek/deepseek-v4-pro-0813')).toEqual({
          selected: 'deepseek/deepseek-v4-pro-0813',
        })
        expect(await app.attachModelCallHost(who, session, hosts[index]!)).toEqual({
          attached: true,
        })
      }
      expect(
        await app.publishCredential(who, async checked => ({
          account: checked.account,
          tenant: checked.tenant,
          sourceRef: ref('d6-completion-credential'),
          body: Buffer.from('d6-private-credential'),
        })),
      ).toEqual({ stored: true })
      firstTask = app.startServiceCall(who, sessions[0]!, {
        user: user('0'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: hosts[0].host,
      })
      await firstEntered.promise
      expect(tls.requests).toHaveLength(1)
      const secondTask = app.startServiceCall(who, sessions[1]!, {
        user: user('1'),
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: hosts[1].host,
      })
      await tls.contentSent.promise
      const second = await secondTask
      if (!('callId' in second) || !('result' in second) || !('replyPending' in second.result))
        throw new Error('second service call did not reach reply handoff')
      expect(
        await app.persistModelReply(who, sessions[1]!, second.result.replyPending),
      ).toHaveProperty('settled')
      releaseFirst.resolve()
      const first = await firstTask
      const sent = [first, second] as const
      const wireBodies = JSON.stringify(tls.requests.map(request => request.body))
      for (const session of sessions) expect(wireBodies).not.toContain(session)
      for (const result of sent) {
        if (!('callId' in result)) throw new Error('service call identity absent')
        expect(wireBodies).not.toContain(result.callId)
      }
      expect(wireBodies).not.toContain('executionId')
      expect(wireBodies).not.toContain('prompt_cache_key')
      for (const [index, result] of sent.entries()) {
        if (!('callId' in result) || !('result' in result) || !('replyPending' in result.result))
          throw new Error('service call did not reach reply handoff')
        if (index === 0)
          expect(
            await app.persistModelReply(who, sessions[index]!, result.result.replyPending),
          ).toHaveProperty('settled')
      }
      const contribution = disposeContribution
      if (!contribution) throw new Error('real Cordis model contribution absent')
      const retained = diagnostics
      expect(diagnostics.transports.health().live[0]?.inspect?.registrations).toBe(1)
      const beforeUnload = await records(diagnostics.tenant.query, diagnostics.tenant.scope)
      expect(beforeUnload.some(row => row.stage === 'reply_handoff')).toBe(true)
      let disposed = false
      const retirement = contribution().then(() => {
        disposed = true
      })
      await expect.poll(() => retained.transports.health().live[0]?.inspect?.retiring).toBe(1)
      expect(disposed).toBe(false)
      for (const host of hosts) await host.stop()
      await retirement
      expect(disposed).toBe(true)
      expect(diagnostics.transports.health().live[0]?.inspect).toMatchObject({
        registrations: 0,
        retiring: 0,
        references: 0,
        executions: 0,
      })
      expect(diagnostics.tenant.health().writeState).toBe('open')
      await expect
        .poll(async () => {
          const rows = await records(retained.local.query, retained.local.scope)
          return rows.some(row => row.stage === 'retirement')
        })
        .toBe(true)
      const afterUnload = await records(diagnostics.tenant.query, diagnostics.tenant.scope)
      expect(afterUnload.length).toBeGreaterThanOrEqual(beforeUnload.length)
      expect(afterUnload.some(row => row.stage === 'reply_handoff')).toBe(true)
      expect('entries' in (await app.readSessionLog(who, sessions[0]!))).toBe(true)
      const closed = await diagnostics.closeAfterBusiness(() => app.close())
      expect(closed.complete).toBe(true)
      const tenantRows = await records(diagnostics.tenant.query, diagnostics.tenant.scope)
      const localRows = await records(diagnostics.local.query, diagnostics.local.scope)
      expect(tenantRows.length).toBeGreaterThan(0)
      expect(tenantRows.every(row => row.scope.kind === 'tenant')).toBe(true)
      expect(localRows.every(row => row.scope.kind === 'local')).toBe(true)
      expect(localRows.some(row => row.association?.session !== undefined)).toBe(false)
      for (const [index, result] of sent.entries()) {
        if (!('callId' in result)) throw new Error('service call identity absent')
        const related = tenantRows.filter(row => row.association?.session === sessions[index])
        expect(related.length).toBeGreaterThan(0)
        // A successful ready handoff is a published reference marker, not a runtime settlement
        // batch; the runtime's durable-handoff progress rows carry this call's causal chain.
        expect(related.some(row => row.source === 'runtime' && row.stage === 'reply_handoff')).toBe(
          true,
        )
        expect(related.every(row => row.association?.call === result.callId)).toBe(true)
        // Selection binding is observed before the dispatch is allocated.
        expect(
          related
            .filter(row => row.stage !== 'binding')
            .every(row => row.association?.dispatch !== undefined),
        ).toBe(true)
        expect(related.some(row => row.binding?.modelId !== undefined)).toBe(true)
        const bySequence = new Map(tenantRows.map(row => [row.sequence, row]))
        const causal = related.filter(row => row.association?.causedBy !== undefined)
        expect(causal.length).toBeGreaterThan(0)
        for (const row of causal) {
          const parent = row.association?.causedBy
          if (!parent) throw new Error('causal parent absent')
          expect(parent.collectorId).toBe(row.collectorId)
          expect(BigInt(parent.sequence) < BigInt(row.sequence)).toBe(true)
          expect(bySequence.get(parent.sequence)?.association?.session).toBe(sessions[index])
        }
      }
      expect(
        tenantRows.every(
          row =>
            row.association?.session === undefined ||
            sessions.some(session => session === row.association?.session),
        ),
      ).toBe(true)
      const otherTenant = unwrap(
        parseTenantId({ organization: who.tenant.organization, account: 'd6-other-account' }),
      )
      expect(
        await diagnostics.tenant.query({
          scope: { kind: 'tenant', tenant: otherTenant },
          limit: 128,
          maxBytes: 1_048_576,
        }),
      ).toEqual({ rejected: 'forbidden' })
      const serialized = JSON.stringify([...tenantRows, ...localRows])
      expect(serialized).not.toContain('d6-private-credential')
      expect(serialized).not.toContain('d6 private prompt')
      expect(tls.requests).toHaveLength(2)
    } finally {
      releaseFirst.resolve()
      if (firstTask) await Promise.allSettled([firstTask])
      for (const host of hosts) await host.stop()
      if (diagnostics) await diagnostics.closeAfterBusiness(() => app.close())
      else await app.close()
      await tls.close()
    }
  })
})
