// @module-tag slow
// The `agent-account-outlet` row: the real account outlet (`AgentAccountOutletProvider` of
// `@omne-harness/agent-context/cordis`) on a real Cordis. The row is ACTIVE and provides
// `agentAccountOutlet` once `requestContext` and `contextAccountingInbox` are present; with either
// one absent it stays PENDING and names that key. The two providers are test stand-ins of the
// abstract services: the real ones are the `request-context` row. In the first wave the outlet has
// no target resolver, so a delivery answers `unavailable` with `scope-unresolved` and nothing
// reaches the inbox; a delivery is never turned into a success. The plugin takes the adoption
// identity `sender`; the assembly page lists no configuration for this row (see the row file).
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import type { AgentAccountOutlet } from '@omne-harness/agent-contract'
import { sampleAccountHandoff } from '@omne-harness/agent-contract/testing'
import { agentAccountOutletKey } from '@omne-harness/agent-cordis-contract/cordis'
import { accountCodec, organizationCodec, tenant as tenantOf } from '@omne-harness/legal-identity'
import type { Access } from '@omne-harness/request-context-contract'
import {
  ContextAccountingInboxService,
  RequestContextService,
  contextAccountingInboxKey,
  requestContextKey,
} from '@omne-harness/request-context-cordis-contract/cordis'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { serveProfile } from '../../../src/profile.ts'
import { agentAccountOutletRow } from '../../../src/rows/agent-account-outlet/index.ts'
import type { RowId } from '../../../src/types.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}
const tenant = tenantOf(
  parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
)
const access: Access<string> = { principal: 'ada', tenant }
const sender = { owner: 'agent-context', name: 'outlet', revision: '1', digest: 'sha256:outlet' }

const refused = { kind: 'unavailable' as const, diagnostic: 'stand-in' }

/** Stands in for the `request-context` row's `requestContext`; nothing here is exercised. */
class RequestContextDouble extends RequestContextService<unknown> {
  readonly contributeSection: RequestContextService<unknown>['contributeSection'] = input => ({
    kind: 'rejected',
    reason: 'no-scope',
    name: input.name,
  })
  readonly contributeVariable: RequestContextService<unknown>['contributeVariable'] = input => ({
    kind: 'rejected',
    reason: 'no-scope',
    name: input.name,
  })
  readonly contributions: RequestContextService<unknown>['contributions'] = () => ({
    kind: 'rejected',
    reason: 'closed',
  })
  readonly register: RequestContextService<unknown>['register'] = async () => refused
  readonly replace: RequestContextService<unknown>['replace'] = async () => refused
  readonly assembly: RequestContextService<unknown>['assembly'] = () => {
    throw new Error('the outlet row does not assemble')
  }
}

/** Stands in for the `request-context` row's `contextAccountingInbox`; counts what reaches it. */
function inboxDouble(received: unknown[]) {
  return class InboxDouble extends ContextAccountingInboxService<unknown> {
    readonly receive: ContextAccountingInboxService<unknown>['receive'] = async input => {
      received.push(input)
      return refused
    }
    readonly usage: ContextAccountingInboxService<unknown>['usage'] = async () => refused
  }
}

function providerRow(id: string, key: string, make: (ctx: Context) => void) {
  return declared(
    defineRow({
      row: id,
      implementation: 'contract-double',
      manifest: { provides: [key], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: { name: id, apply: make },
    }),
  )
}

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(options: {
  requestContext: boolean
  inbox: boolean
  config?: unknown
  received?: unknown[]
}): Promise<LoadedTree> {
  const base = makeBase()
  release.push(() => base.release())
  const Inbox = inboxDouble(options.received ?? [])
  const complete = options.requestContext && options.inbox
  const tree = await loadTree({
    base,
    rows: [
      ...(options.requestContext
        ? [
            providerRow('request-context-double', requestContextKey, ctx => {
              new RequestContextDouble(ctx)
            }),
          ]
        : []),
      ...(options.inbox
        ? [
            providerRow('inbox-double', contextAccountingInboxKey, ctx => {
              new Inbox(ctx)
            }),
          ]
        : []),
      declared(agentAccountOutletRow, options.config ?? { sender }),
    ],
    entryObjects: [],
    readinessTimeoutMs: complete ? 10_000 : 2000,
  })
  release.push(() => tree.dispose())
  return tree
}

type Schema = { '~standard': { validate(value: unknown): { issues?: unknown } } }
function accepts(value: unknown): boolean {
  const config = agentAccountOutletRow.Config as Schema | undefined
  expect(config).toBeDefined()
  return config?.['~standard'].validate(value).issues === undefined
}

describe('the agent-account-outlet row: declaration', () => {
  it('is the real row and equals the table row of the assembly page, with no shutdown phase', () => {
    const declaration = rowDeclarationOf(agentAccountOutletRow)
    expect(declaration).toEqual({
      row: 'agent-account-outlet',
      implementation: 'real',
      manifest: {
        provides: ['agentAccountOutlet'],
        injects: ['requestContext', 'contextAccountingInbox'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
    const table = serveProfile().stubManifests.get('agent-account-outlet' as RowId)
    expect(declaration?.manifest).toEqual(table)
  })

  it('takes the sender adoption and nothing else', () => {
    expect(accepts({ sender })).toBe(true)
    expect(accepts({})).toBe(false)
    expect(accepts({ sender, extra: 1 })).toBe(false)
    expect(accepts({ sender: { owner: 'agent-context' } })).toBe(false)
  })
})

describe('the agent-account-outlet row: on test stand-ins of its two injects', () => {
  it('is ACTIVE and provides `agentAccountOutlet`', { timeout: 60_000 }, async () => {
    const tree = await start({ requestContext: true, inbox: true })
    expect(tree.allActive).toBe(true)
    expect(tree.state('agent-account-outlet')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.service(agentAccountOutletKey)).toBeDefined()
  })

  it('without `requestContext` stays PENDING and names it', { timeout: 60_000 }, async () => {
    const tree = await start({ requestContext: false, inbox: true })
    expect(tree.state('agent-account-outlet')).toMatchObject({
      state: 'PENDING',
      missing: ['requestContext'],
    })
    expect(tree.service(agentAccountOutletKey)).toBeUndefined()
  })

  it(
    'without `contextAccountingInbox` stays PENDING and names it',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ requestContext: true, inbox: false })
      expect(tree.state('agent-account-outlet')).toMatchObject({
        state: 'PENDING',
        missing: ['contextAccountingInbox'],
      })
      expect(tree.service(agentAccountOutletKey)).toBeUndefined()
    },
  )

  it(
    'answers `scope-unresolved` as unavailable and reaches no inbox',
    { timeout: 60_000 },
    async () => {
      const received: unknown[] = []
      const tree = await start({ requestContext: true, inbox: true, received })
      const outlet = tree.service<AgentAccountOutlet<unknown>>(agentAccountOutletKey)!
      const handoff = sampleAccountHandoff(tenant, 'row')
      expect(await outlet.deliver({ access, handoff })).toEqual({
        kind: 'unavailable',
        diagnostic: 'scope-unresolved',
      })
      expect(received).toEqual([])
    },
  )

  it('fails the row on a configuration without the sender', { timeout: 60_000 }, async () => {
    const tree = await start({ requestContext: true, inbox: true, config: {} })
    expect(tree.state('agent-account-outlet').state).toBe('FAILED')
    expect(tree.service(agentAccountOutletKey)).toBeUndefined()
  })
})
