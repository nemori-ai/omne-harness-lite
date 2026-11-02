// @module-tag slow
// The `agent-instances` row: the real Agent instance directory (`agentInstancesPlugin` of
// `@omne-harness/agent-cordis-contract/cordis`) on a real Cordis. The row is ACTIVE and provides
// `agentInstances` once `agentPublicationAuthority` and `agentAccessCheck` are present; with either
// one absent it stays PENDING and names that key. A refusal of the publication authority comes back
// as the contract failure, never as a registration. The two providers are test stand-ins of the
// abstract services: the real ones are the `agent-host` and `authorization` rows.
import { afterEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  decodeAgentInstanceId,
  decodeAgentOperationId,
  type AgentAccessDecision,
  type AgentState,
  type Failure,
  type Registration,
} from '@omne-harness/agent-contract'
import {
  AgentAccessCheckService,
  AgentPublicationAuthorityService,
  agentAccessCheckKey,
  agentInstancesKey,
  agentPublicationAuthorityKey,
  type AgentInstancesService,
  type AgentRegistrationInput,
} from '@omne-harness/agent-cordis-contract/cordis'
import { accountCodec, organizationCodec, tenant as tenantOf } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import { serveProfile } from '../../../src/profile.ts'
import { agentInstancesRow } from '../../../src/rows/agent-instances/index.ts'
import type { RowId } from '../../../src/types.ts'
import { declared, loadTree, makeBase, type LoadedTree } from '../session-fixtures/tree.ts'

type Answer = Outcome<Registration, Failure>

function parsed<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('fixture identity text does not parse')
  return result.value
}
function decoded<T>(outcome: { ok: T } | { failure: unknown }): T {
  if ('failure' in outcome) throw new Error('fixture identity text does not decode')
  return outcome.ok
}

const tenant = tenantOf(
  parsed(organizationCodec.parse(`org_${'0'.repeat(26)}`)),
  parsed(accountCodec.parse(`acc_${'1'.repeat(26)}`)),
)

function registrationInput(): AgentRegistrationInput<string> {
  const instance = decoded(decodeAgentInstanceId('instance_1'))
  const state: AgentState = { kind: 'idle', instance }
  return {
    principal: 'host',
    tenant,
    operation: decoded(decodeAgentOperationId('operation_1')),
    instance,
    scope: { owner: 'test', record: 'scope', revision: '1', digest: 'sha256:scope' },
    state,
  }
}

const refusal: Failure = { kind: 'unsupported' }

/** Stands in for the `agent-host` row's publication authority; `answer` is what it says. */
function authorityRow(answer: 'allow' | Failure) {
  class Authority extends AgentPublicationAuthorityService<string> {
    readonly check: AgentPublicationAuthorityService<string>['check'] = () =>
      answer === 'allow' ? { ok: undefined } : { failure: answer }
  }
  return declared(
    defineRow({
      row: 'agent-host',
      implementation: 'contract-double',
      manifest: {
        provides: [agentPublicationAuthorityKey],
        injects: [],
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'authority-double',
        apply(ctx: Context) {
          new Authority(ctx)
        },
      },
    }),
  )
}

/** Stands in for the `authorization` row's Agent access check. */
function accessRow() {
  const allowed: AgentAccessDecision = {
    kind: 'allowed',
    evidence: { owner: 'test', record: 'grant', revision: '1', digest: 'sha256:grant' },
  }
  class Access extends AgentAccessCheckService<string> {
    readonly check: AgentAccessCheckService<string>['check'] = async () => allowed
  }
  return declared(
    defineRow({
      row: 'authorization',
      implementation: 'contract-double',
      manifest: { provides: [agentAccessCheckKey], injects: [], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: 'access-double',
        apply(ctx: Context) {
          new Access(ctx)
        },
      },
    }),
  )
}

const PROBE = 'agent-instances-probe' as RowId

/** A contributor fiber: registers one instance and keeps the answer. */
function probeRow(capture: (answer: Promise<Answer>) => void) {
  return declared(
    defineRow({
      row: PROBE,
      implementation: 'real',
      manifest: { provides: [], injects: [agentInstancesKey], sameProviderGroup: null },
      lifecycle: { kind: 'none' },
      plugin: {
        name: PROBE,
        inject: [agentInstancesKey],
        apply(ctx: Context) {
          const directory = ctx[agentInstancesKey] as AgentInstancesService<string>
          capture(directory.register(registrationInput()))
        },
      },
    }),
  )
}

const release: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const close of release.splice(0).reverse()) await close()
})

async function start(options: {
  authority: 'allow' | Failure | null
  access: boolean
  probe?: (answer: Promise<Answer>) => void
}): Promise<LoadedTree> {
  const base = makeBase()
  release.push(() => base.release())
  const tree = await loadTree({
    base,
    rows: [
      ...(options.authority === null ? [] : [authorityRow(options.authority)]),
      ...(options.access ? [accessRow()] : []),
      declared(agentInstancesRow),
      ...(options.probe === undefined ? [] : [probeRow(options.probe)]),
    ],
    entryObjects: [],
    readinessTimeoutMs: options.authority !== null && options.access ? 10_000 : 2000,
  })
  release.push(() => tree.dispose())
  return tree
}

describe('the agent-instances row: declaration', () => {
  it('is the real row and equals the table row of the assembly page, with no shutdown phase', () => {
    const declaration = rowDeclarationOf(agentInstancesRow)
    expect(declaration).toEqual({
      row: 'agent-instances',
      implementation: 'real',
      manifest: {
        provides: ['agentInstances'],
        injects: ['agentPublicationAuthority', 'agentAccessCheck'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
    const table = serveProfile().stubManifests.get('agent-instances' as RowId)
    expect(declaration?.manifest).toEqual(table)
  })

  it('takes no configuration', () => {
    const config = agentInstancesRow.Config as
      | { '~standard': { validate(value: unknown): { issues?: unknown } } }
      | undefined
    expect(config).toBeDefined()
    expect(config?.['~standard'].validate({}).issues).toBeUndefined()
    expect(config?.['~standard'].validate({ extra: 1 }).issues).toBeDefined()
  })
})

describe('the agent-instances row: on test stand-ins of its two injects', () => {
  it('is ACTIVE and provides `agentInstances`', { timeout: 60_000 }, async () => {
    const tree = await start({ authority: 'allow', access: true })
    expect(tree.allActive).toBe(true)
    expect(tree.state('agent-instances')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(tree.service(agentInstancesKey)).toBeDefined()
  })

  it(
    'without the publication authority stays PENDING and names `agentPublicationAuthority`',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ authority: null, access: true })
      expect(tree.state('agent-instances')).toMatchObject({
        state: 'PENDING',
        missing: ['agentPublicationAuthority'],
      })
      expect(tree.service(agentInstancesKey)).toBeUndefined()
    },
  )

  it(
    'without the access check stays PENDING and names `agentAccessCheck`',
    { timeout: 60_000 },
    async () => {
      const tree = await start({ authority: 'allow', access: false })
      expect(tree.state('agent-instances')).toMatchObject({
        state: 'PENDING',
        missing: ['agentAccessCheck'],
      })
      expect(tree.service(agentInstancesKey)).toBeUndefined()
    },
  )

  it('publishes a registration the authority allows', { timeout: 60_000 }, async () => {
    let answer: Promise<Answer> | undefined
    await start({ authority: 'allow', access: true, probe: captured => (answer = captured) })
    expect(await answer).toMatchObject({ ok: { state: 'published' } })
  })

  it(
    'returns the failure of the authority as it is, not a registration',
    { timeout: 60_000 },
    async () => {
      let answer: Promise<Answer> | undefined
      await start({ authority: refusal, access: true, probe: captured => (answer = captured) })
      expect(await answer).toEqual({ failure: refusal })
    },
  )
})
