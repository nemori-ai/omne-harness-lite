// 两个由入口签发的系统主体（AA 运行时对象表「Agent 宿主维护主体」「常驻引用读取主体」）：`agentHostPrincipal`
// 与 `toolResidencyPrincipal` 在根上 provide，消费行按名 `ctx.get`；组件名与授权行的授予表一致，所以现行
// 授权对 `publish`/`quiesce`/`withdraw` 与 `resident-references` 放行；本运行的核验器核实它们，别的签发者签的不算。
import type { Context, Plugin } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  SYSTEM_ACTION_MATRIX,
  noArguments,
  referenceSystemActionAuthorization,
  type SystemActionRequest,
  type SystemActionRow,
} from '@omne-harness/authorization'
import {
  inProcessPrincipalAuthority,
  type Principal,
  type SystemPrincipal,
} from '@omne-harness/identity'
import { principalIssuerKey, principalVerifierKey } from '@omne-harness/identity/cordis'
import {
  AGENT_HOST_COMPONENT,
  TOOL_RESIDENCY_COMPONENT,
  releaseMaintenanceGrants,
} from '../../src/rows/authorization/index.ts'
import {
  AGENT_HOST_PRINCIPAL_KEY,
  agentHostPrincipal,
} from '../../src/entry/agent-host-principal.ts'
import { principalIssuer, principalVerifier, verifierOf } from '../../src/entry/principals.ts'
import {
  TOOL_RESIDENCY_PRINCIPAL_KEY,
  toolResidencyPrincipal,
} from '../../src/entry/tool-residency-principal.ts'
import { fixtureEnv, fixtureTenant, got, heldValues, principalOf } from './support.ts'

const TRUSTED = [principalIssuerKey]

async function installed() {
  const fixture = fixtureEnv(TRUSTED)
  await fixture.install(principalVerifier)
  await fixture.install(principalIssuer)
  await fixture.install(agentHostPrincipal)
  await fixture.install(toolResidencyPrincipal)
  const host = principalOf(got(fixture.root.get(AGENT_HOST_PRINCIPAL_KEY), 'agentHostPrincipal'))
  const residency = principalOf(
    got(fixture.root.get(TOOL_RESIDENCY_PRINCIPAL_KEY), 'toolResidencyPrincipal'),
  )
  return { fixture, host, residency }
}

/** 消费行：静态 inject 一个名字，插件体里按名 `ctx.get`，把拿到的值写进 `seen`。 */
function consumerOf(name: string, seen: unknown[]): Plugin.Object {
  return {
    name: `probe-${name}`,
    inject: [name],
    apply(ctx: Context) {
      seen.push(ctx.get(name))
    },
  }
}

function rowOf(purpose: string): SystemActionRow {
  const row = SYSTEM_ACTION_MATRIX.find(entry => entry.purpose === purpose)
  if (row === undefined) throw new Error(`no matrix row ${purpose}`)
  return row
}

function requestFor(row: SystemActionRow, principal: SystemPrincipal): SystemActionRequest {
  const target =
    row.target === 'system'
      ? ({ kind: 'system', resource: { ...row.resource, key: 'k' } } as const)
      : ({
          kind: 'tenant',
          tenant: fixtureTenant('a'),
          resource: { ...row.resource, key: 'k' },
        } as const)
  return {
    principal,
    scope: 'system',
    operation: row.operation,
    target,
    arguments: row.arguments === 'none' ? noArguments() : { digest: 'sha256:0' },
  }
}

function systemOf(principal: Principal): SystemPrincipal {
  if (principal.kind !== 'system') throw new Error('fixture: expected a system principal')
  return principal
}

describe('agentHostPrincipal and toolResidencyPrincipal on a real Cordis context', () => {
  it('are provided on the root as the system principals of DP-1 table 3-3, with the grant-table component names', async () => {
    const { host, residency } = await installed()
    expect(host).toEqual({ kind: 'system', component: AGENT_HOST_COMPONENT })
    expect(residency).toEqual({ kind: 'system', component: TOOL_RESIDENCY_COMPONENT })
    expect(host).not.toBe(residency)
    expect(Object.isFrozen(host)).toBe(true)
    expect(Object.isFrozen(residency)).toBe(true)
    expect(agentHostPrincipal).toMatchObject({
      name: 'agentHostPrincipal',
      implementation: 'real',
    })
    expect(toolResidencyPrincipal).toMatchObject({
      name: 'toolResidencyPrincipal',
      implementation: 'real',
    })
  })

  it('a consuming plugin that injects the name reads the very principal through ctx.get', async () => {
    const { fixture, host, residency } = await installed()
    const seenHost: unknown[] = []
    const seenResidency: unknown[] = []
    await fixture.root.plugin(consumerOf(AGENT_HOST_PRINCIPAL_KEY, seenHost))
    await fixture.root.plugin(consumerOf(TOOL_RESIDENCY_PRINCIPAL_KEY, seenResidency))
    expect(seenHost).toEqual([host])
    expect(seenHost[0]).toBe(host)
    expect(seenResidency).toEqual([residency])
    expect(seenResidency[0]).toBe(residency)
  })

  it('are issued by the authority of this run: the installed verifier and verifierOf(env) verify them, another authority rejects them', async () => {
    const { fixture, host, residency } = await installed()
    const verifier = got(fixture.root.get(principalVerifierKey), 'principalVerifier')
    for (const principal of [host, residency]) {
      await expect(verifier.verify(principal)).resolves.toEqual({ kind: 'verified', principal })
      await expect(verifierOf(fixture.env).verify(principal)).resolves.toMatchObject({
        kind: 'verified',
      })
      await expect(inProcessPrincipalAuthority().verifier.verify(principal)).resolves.toEqual({
        kind: 'rejected',
      })
      await expect(verifier.verify({ ...principal })).resolves.toEqual({ kind: 'rejected' })
    }
  })

  it('pass the release authorization for exactly their own maintenance purposes and are denied grant-missing for each other’s', async () => {
    const { fixture, host, residency } = await installed()
    const authorization = referenceSystemActionAuthorization({
      verifier: verifierOf(fixture.env),
      grants: releaseMaintenanceGrants(),
      clock: null,
    })
    const hostPurposes = [
      'agent-instance-publish',
      'agent-instance-quiesce',
      'agent-instance-withdraw',
    ]
    for (const purpose of hostPurposes) {
      await expect(
        authorization.check(requestFor(rowOf(purpose), systemOf(host))),
        `host on ${purpose}`,
      ).resolves.toMatchObject({
        kind: 'allowed',
        basis: { grant: { record: `maintenance-grant/${AGENT_HOST_COMPONENT}` } },
      })
      await expect(
        authorization.check(requestFor(rowOf(purpose), systemOf(residency))),
        `residency on ${purpose}`,
      ).resolves.toMatchObject({ kind: 'denied', reason: 'grant-missing' })
    }
    await expect(
      authorization.check(requestFor(rowOf('resident-references'), systemOf(residency))),
    ).resolves.toMatchObject({
      kind: 'allowed',
      basis: { grant: { record: `maintenance-grant/${TOOL_RESIDENCY_COMPONENT}` } },
    })
    await expect(
      authorization.check(requestFor(rowOf('resident-references'), systemOf(host))),
    ).resolves.toMatchObject({ kind: 'denied', reason: 'grant-missing' })
  })

  it('fail installation loudly when the trusted issuer is not installed yet, and provide nothing', async () => {
    const fixture = fixtureEnv(TRUSTED)
    await expect(fixture.install(agentHostPrincipal)).rejects.toThrow(/principalIssuer/u)
    await expect(fixture.install(toolResidencyPrincipal)).rejects.toThrow(/principalIssuer/u)
    expect(fixture.root.get(AGENT_HOST_PRINCIPAL_KEY)).toBeUndefined()
    expect(fixture.root.get(TOOL_RESIDENCY_PRINCIPAL_KEY)).toBeUndefined()
  })

  it('hold no issuer on the module objects, and print none', async () => {
    await installed()
    const held = new Set([...heldValues(agentHostPrincipal), ...heldValues(toolResidencyPrincipal)])
    const issuerLike = (value: unknown): boolean =>
      typeof value === 'object' &&
      value !== null &&
      'issueActingForTenant' in value &&
      typeof value.issueActingForTenant === 'function'
    expect([...held].some(issuerLike)).toBe(false)
    expect(JSON.stringify({ agentHostPrincipal, toolResidencyPrincipal })).not.toMatch(
      /issueSystem|issueActingForTenant|authority/u,
    )
  })
})
