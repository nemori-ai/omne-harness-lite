// D2 of the identity delivery spec: the Session and Agent operations are neutral to the tenant
// role. For every `member` cell of the two policy tables the test reads the standing of a super
// administrator and of an ordinary member, runs the real access check on both, and requires the
// same verdict and an empty `requires`. The negative control gives one cell at a time a non-empty
// `requires` (the named qualification only the super administrator holds) and requires the probe
// to name exactly that cell, so a neutral result cannot come from a probe that sees nothing.
import { describe, expect, it } from 'vitest'
import {
  inProcessPrincipalAuthority,
  type PrincipalVerifier,
  type TenantStandingReading,
  type TenantStandingSource,
} from '@omne-harness/identity'
import {
  referenceAdmissionCheck,
  referenceSystemActionAuthorization,
  type AdmissionInput,
} from '@omne-harness/authorization'
import type { SessionAccessRequest } from '@omne-harness/session-contract'
import { sessionId } from '@omne-harness/session-contract/testing'
import {
  AGENT_POLICY,
  MAINTENANCE_GRANTS,
  SESSION_POLICY,
  releaseMaintenanceGrants,
  type PolicyRow,
} from '../../../src/rows/authorization/index.ts'
import {
  createAgentAccessCheck,
  createSessionAccessCheck,
  type AccessPorts,
} from '../../../src/rows/authorization/adapters.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const TENANT = fixtureTenant('a')
const OWN = sessionId('ses_own')
const MODEL = { model: 'default-team', revision: '1' }
const LEDGER = 'organization-cost-ledger-read' as const
const evidence = { record: 'standing/test', revision: '1' }

type RoleName = 'super-admin' | 'member'
const ROLES: readonly RoleName[] = ['super-admin', 'member']

/** The standing of a role. Only the super administrator holds the named qualification. */
function standingOf(role: RoleName): TenantStandingReading {
  return {
    kind: 'member',
    role: { role, model: MODEL },
    qualifications: role === 'super-admin' ? [LEDGER] : [],
    evidence,
  }
}

type Principals = Readonly<{ login: unknown; work: unknown }>
type Run = (ports: AccessPorts, principals: Principals) => Promise<{ kind: string }>
type MemberCellRef = Readonly<{ id: string; run: Run }>
type Probe = Readonly<{ verdict: string; requires: readonly string[] }>
type PolicyTable = Readonly<Record<string, PolicyRow>>

/** `injectOn` gives the admission request of that one cell a non-empty `requires`. */
async function probeCell(
  role: RoleName,
  cell: MemberCellRef,
  injectOn: string | null,
): Promise<Probe> {
  const authority = inProcessPrincipalAuthority()
  const verifier: PrincipalVerifier = { verify: value => authority.verifier.verify(value) }
  const standing: TenantStandingSource = { read: () => Promise.resolve(standingOf(role)) }
  const admission = referenceAdmissionCheck({ verifier, standing, permits: null })
  const systemActions = referenceSystemActionAuthorization({
    verifier,
    grants: releaseMaintenanceGrants(MAINTENANCE_GRANTS),
    clock: null,
  })
  const seen: AdmissionInput[] = []
  const ports: AccessPorts = {
    admission: {
      check: input => {
        const sent: AdmissionInput = injectOn === cell.id ? { ...input, requires: [LEDGER] } : input
        seen.push(sent)
        return admission.check(sent)
      },
    },
    systemActions: { check: input => systemActions.check(input) },
  }
  const actor = okOf(authority.issuer.issueSystem({ component: 'sessionWorkPrincipals' }), 'actor')
  const acting = (owner: string, work: string) =>
    okOf(
      authority.issuer.issueActingForTenant({ actor, tenant: TENANT, work: { owner, work } }),
      'acting',
    )
  const answer = await cell.run(ports, {
    login: acting('identity-login', 'lgs_x'),
    work: acting('session', OWN),
  })
  return { verdict: answer.kind, requires: seen.flatMap(input => input.requires) }
}

const scopeReleaseFact = {
  fact: {
    kind: 'scope-release',
    archive: 'op_1',
    scope: 'scope_1',
    dispositions: ['released'],
    source: 'e',
  },
}
const ordinary = { value: { kind: 'ordinary', input: 'i', message: 'm', origin: 'o' } }
const business = { value: { kind: 'business', owner: 'o', input: 'i', destination: 'd' } }

/** The operations that carry a command. The others are reads on a session or on the tenant. */
const MUTATING = new Set([
  'addTodo',
  'removeTodo',
  'markTodoComplete',
  'accept',
  'startRun',
  'claim',
  'reload',
  'recordMessage',
  'preserveResult',
  'completeConsumption',
  'completeExternalConsumption',
  'bindExternalCall',
  'commitDerived',
  'release',
  'control',
  'finishRun',
  'create',
  'completeInitialization',
  'change',
  'setRelation',
  'configureAutoArchive',
  'considerAutoArchive',
  'recordIdle',
  'interrupt',
  'cancelRun',
  'stopCall',
  'freeze',
  'receive',
])

function extraFor(
  operation: string,
  cell: { when?: { kinds: readonly string[] } },
): Record<string, unknown> {
  if (operation === 'accept') return cell.when?.kinds.includes('business') ? business : ordinary
  if (operation === 'receive') return scopeReleaseFact
  if (operation === 'change')
    return { declaration: { kind: 'permission-mode', value: 'never', authorization: evidence } }
  return {}
}

function sessionRun(operation: string, column: 'login' | 'work', extra: object): Run {
  return (ports, principals) => {
    const target =
      operation === 'pending'
        ? { kind: 'tenant', tenant: TENANT }
        : MUTATING.has(operation)
          ? {
              kind: 'session',
              session: OWN,
              command: { kind: operation, input: { tenant: TENANT, session: OWN, ...extra } },
            }
          : { kind: 'session', session: OWN }
    const request = { access: { principal: principals[column], tenant: TENANT }, operation, target }
    return createSessionAccessCheck(ports).check(request as SessionAccessRequest<unknown>)
  }
}

function agentRun(operation: string, column: 'login' | 'work'): Run {
  return (ports, principals) =>
    createAgentAccessCheck(ports).check({
      access: { principal: principals[column], tenant: TENANT },
      operation,
      target: {
        kind: 'scope',
        scope: { owner: 'session', record: OWN, revision: '1', digest: 'd' },
        definition: { owner: 'o', name: 'n', revision: '1', digest: 'd' },
      },
    } as unknown as Parameters<ReturnType<typeof createAgentAccessCheck>['check']>[0])
}

function memberCells(): readonly MemberCellRef[] {
  const cells: MemberCellRef[] = []
  for (const [operation, row] of Object.entries(SESSION_POLICY as PolicyTable)) {
    for (const column of ['login', 'work'] as const) {
      const cell = row[column]
      if (cell.verdict !== 'member') continue
      cells.push({
        id: `session.${operation}.${column}`,
        run: sessionRun(operation, column, extraFor(operation, cell)),
      })
    }
  }
  for (const [operation, row] of Object.entries(AGENT_POLICY as PolicyTable)) {
    for (const column of ['login', 'work'] as const) {
      if (row[column].verdict !== 'member') continue
      cells.push({ id: `agent.${operation}.${column}`, run: agentRun(operation, column) })
    }
  }
  return cells
}

/** The cells whose verdict or `requires` differ between the two roles, or whose `requires` is not empty. */
async function divergentCells(injectOn: string | null): Promise<readonly string[]> {
  const out: string[] = []
  for (const cell of memberCells()) {
    const [admin, plain] = await Promise.all(ROLES.map(role => probeCell(role, cell, injectOn)))
    if (JSON.stringify(admin) !== JSON.stringify(plain) || admin?.requires.length !== 0)
      out.push(cell.id)
  }
  return out
}

describe('role-neutral-member-cells', () => {
  const cells = memberCells()

  it('covers every member cell of both tables', () => {
    const count = [SESSION_POLICY, AGENT_POLICY as PolicyTable]
      .flatMap(table => Object.values(table as PolicyTable))
      .flatMap(row => [row.login, row.work])
      .filter(cell => cell.verdict === 'member').length
    expect(cells).toHaveLength(count)
    expect(count).toBeGreaterThan(40)
  })

  it('includes the two cells R2-D204 opened for the own login, so restoring them to pending turns this red', () => {
    const ids = cells.map(cell => cell.id)
    expect(ids).toContain('session.setRelation.login')
    expect(ids).toContain('session.configureAutoArchive.login')
  })

  it('allows each member cell for both roles, so the comparison is not between two denials', async () => {
    for (const cell of cells) {
      for (const role of ROLES) {
        const probe = await probeCell(role, cell, null)
        expect(probe.verdict, `${cell.id} as ${role}`).toBe('allowed')
      }
    }
  })

  it('gives the super administrator and the ordinary member the same verdict on every member cell, with an empty requires', async () => {
    expect(await divergentCells(null)).toEqual([])
  })

  it('goes red on a cell that names a qualification, for each cell in turn', async () => {
    for (const cell of cells) expect(await divergentCells(cell.id), cell.id).toEqual([cell.id])
  })
})
