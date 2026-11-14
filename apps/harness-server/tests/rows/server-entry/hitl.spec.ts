import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import {
  GetCardSchema,
  GetOperationSchema,
  ListPoolSchema,
  SubmitReplySchema,
} from '@omne-harness/human-intervention'
import { hitlCommandBinding } from '@omne-harness/human-intervention-local'
import { inProcessPrincipalAuthority, type ActingForTenantPrincipal } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { hitlFacesOfCall } from '../../../src/rows/server-entry/hitl.ts'
import { toolHitlHolder } from '../../../src/rows/tool-hitl/holder.ts'
import type { ToolHitlHost } from '../../../src/rows/tool-hitl/host.ts'
import { fixtureTenant } from '../../entry/support.ts'

const authority = inProcessPrincipalAuthority()
const textOf = (tenant: TenantId): string => {
  const text = tenantCodec.encode(tenant)
  if (!text.ok) throw new Error('fixture tenant')
  return text.value
}
const principalOf = (tenant: TenantId): ActingForTenantPrincipal => {
  const actor = authority.issuer.issueSystem({ component: 'server-entry' })
  if ('failure' in actor) throw new Error('actor')
  const issued = authority.issuer.issueActingForTenant({
    actor: actor.ok,
    tenant,
    work: { owner: 'harness.hitl', work: 'cards' },
  })
  if ('failure' in issued) throw new Error('principal')
  return issued.ok
}
const tenantA = fixtureTenant('a')
const tenantB = fixtureTenant('b')
const tenantC = fixtureTenant('c')
const tenantD = fixtureTenant('d')

const operationOf = (tenant: TenantId) => ({
  tenantRef: textOf(tenant),
  actorRef: 'principal/1/entry',
  operationId: 'reply-1',
})
const submitOf = (tenant: TenantId) =>
  SubmitReplySchema.parse({
    protocol: 'hitl/1',
    operation: operationOf(tenant),
    cardRef: { request: { tenantRef: textOf(tenant), requestId: 'r' }, cardId: 'c' },
    expectedRevision: '0',
    reply: { kind: 'decline' },
  })

function world(qualification: unknown = { kind: 'qualified' }) {
  const calls: string[] = []
  const qualified: string[] = []
  const application = (tenant: string) => {
    const answer = (method: string) => async () => {
      calls.push(`${tenant}:${method}`)
      return { kind: method, tenant }
    }
    return {
      listPool: answer('listPool'),
      getCard: answer('getCard'),
      getOperation: answer('getOperation'),
      submitReply: answer('submitReply'),
    }
  }
  const host = {
    tenant: async (text: string) =>
      text === textOf(tenantC)
        ? { kind: 'unavailable', diagnostic: 'tenant domain lookup answered unknown' }
        : text === textOf(tenantD)
          ? { kind: 'unregistered' }
          : { kind: 'ready', tenant: { application: application(text) } },
    qualify: async (text: string) => {
      qualified.push(text)
      return qualification
    },
  } as unknown as ToolHitlHost
  const ctx = new Context()
  const faces = hitlFacesOfCall(ctx)
  return { calls, qualified, faces, holder: toolHitlHolder(ctx), host }
}

const list = (tenant: TenantId, cursor?: string) =>
  ListPoolSchema.parse({
    protocol: 'hitl/1',
    tenantRef: textOf(tenant),
    locationRef: 'local',
    limit: 20,
    ...(cursor === undefined ? {} : { cursor }),
  })

describe('the HITL entry faces of the server-entry row', () => {
  it('routes every call to the HITL application of the principal tenant', async () => {
    const w = world()
    w.holder.host = w.host
    const a = principalOf(tenantA)
    const b = principalOf(tenantB)
    const card = GetCardSchema.parse({
      protocol: 'hitl/1',
      cardRef: { request: { tenantRef: textOf(tenantA), requestId: 'r' }, cardId: 'c' },
    })
    const binding = hitlCommandBinding('submitReply', submitOf(tenantA))
    const operation = GetOperationSchema.parse({ protocol: 'hitl/1', ...binding })
    expect(await w.faces.queries.listPool(a, list(tenantA))).toMatchObject({
      tenant: textOf(tenantA),
    })
    await w.faces.queries.listPool(b, list(tenantB))
    await w.faces.queries.getCard(b, card)
    await w.faces.queries.getOperation(a, operation)
    await w.faces.commands.submitReply(a, submitOf(tenantA))
    expect(w.calls).toEqual([
      `${textOf(tenantA)}:listPool`,
      `${textOf(tenantB)}:listPool`,
      `${textOf(tenantB)}:getCard`,
      `${textOf(tenantA)}:getOperation`,
      `${textOf(tenantA)}:submitReply`,
    ])
  })

  it('answers unavailable while no HITL host is installed, and reads the host on every call', async () => {
    const w = world()
    const a = principalOf(tenantA)
    expect(await w.faces.queries.listPool(a, list(tenantA))).toEqual({
      kind: 'unavailable',
      reason: 'the HITL host is not installed',
    })
    expect(await w.faces.commands.submitReply(a, submitOf(tenantA))).toEqual({
      kind: 'unavailable',
      reason: 'the HITL host is not installed',
      operationRef: operationOf(tenantA),
    })
    w.holder.host = w.host
    await w.faces.queries.listPool(a, list(tenantA))
    expect(w.calls).toEqual([`${textOf(tenantA)}:listPool`])
  })

  it('answers unavailable when the host has no application for the tenant', async () => {
    const w = world()
    w.holder.host = w.host
    expect(await w.faces.queries.listPool(principalOf(tenantC), list(tenantC))).toEqual({
      kind: 'unavailable',
      reason: 'tenant domain lookup answered unknown',
    })
    expect(w.calls).toEqual([])
  })

  it('binds a submitReply command with the binding of the HITL provider', () => {
    const w = world()
    const command = submitOf(tenantA)
    expect(w.faces.bindSubmitReply(command)).toEqual(hitlCommandBinding('submitReply', command))
  })

  describe('a tenant without a domain', () => {
    const card = GetCardSchema.parse({
      protocol: 'hitl/1',
      cardRef: { request: { tenantRef: textOf(tenantD), requestId: 'r' }, cardId: 'c' },
    })

    it('lists an empty page for a reader with standing, after the same qualification as HITL', async () => {
      const w = world()
      w.holder.host = w.host
      expect(await w.faces.queries.listPool(principalOf(tenantD), list(tenantD))).toMatchObject({
        kind: 'page',
        items: [],
        next: null,
      })
      expect(w.qualified).toEqual([textOf(tenantD)])
    })

    it('denies a principal without standing in the tenant, also with a cursor', async () => {
      const w = world({ kind: 'denied', reason: 'qualification' })
      w.holder.host = w.host
      const d = principalOf(tenantD)
      expect(await w.faces.queries.listPool(d, list(tenantD))).toEqual({
        kind: 'denied',
        reason: 'qualification',
      })
      expect(await w.faces.queries.listPool(d, list(tenantD, 'forged.cursor'))).toEqual({
        kind: 'denied',
        reason: 'qualification',
      })
      expect(
        await w.faces.queries.getOperation(
          d,
          GetOperationSchema.parse({
            protocol: 'hitl/1',
            ...hitlCommandBinding('submitReply', submitOf(tenantD)),
          }),
        ),
      ).toEqual({ kind: 'denied', reason: 'qualification' })
    })

    it('answers invalid-input for any cursor: the tenant never gave one', async () => {
      const w = world()
      w.holder.host = w.host
      expect(
        await w.faces.queries.listPool(principalOf(tenantD), list(tenantD, 'forged.cursor')),
      ).toEqual({ kind: 'invalid-input', reason: 'pool-cursor' })
    })

    it('answers unavailable when the qualification cannot be read', async () => {
      const w = world({ kind: 'unavailable', reason: 'identity-standing' })
      w.holder.host = w.host
      expect(await w.faces.queries.listPool(principalOf(tenantD), list(tenantD))).toEqual({
        kind: 'unavailable',
        reason: 'identity-standing',
      })
    })

    it('denies a card read and a reply as for a card that does not exist', async () => {
      const w = world()
      w.holder.host = w.host
      const d = principalOf(tenantD)
      expect(await w.faces.queries.getCard(d, card)).toEqual({ kind: 'denied', reason: 'card' })
      expect(await w.faces.commands.submitReply(d, submitOf(tenantD))).toMatchObject({
        kind: 'denied',
      })
      expect(w.calls).toEqual([])
    })
  })
})
