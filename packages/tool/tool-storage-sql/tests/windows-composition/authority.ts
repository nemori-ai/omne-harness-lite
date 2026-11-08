import { relative, resolve, isAbsolute, dirname } from 'node:path'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import { tenantCodec, tenantEquals, type TenantId } from '@omne-harness/legal-identity'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest, type ToolAccessGuard, type ToolLedgerStore } from '@omne-harness/tool'
import type { LocalToolControlSubject, PrincipalCodec } from '@omne-harness/tool-host-local'
import type { LocalToolRuntimeInput } from '@omne-harness/tool-host-local/cordis'

import type { FacilityGuard, OriginRef } from '@omne-harness/execution-environment-contract'
import { hostObjectToken } from '@omne-harness/execution-environment-host-local'
import { evidence, value } from './helpers.ts'

export function createAuthority(workspace: string, run: string) {
  const makeTenant = (account: string): TenantId => {
    const parsed = tenantCodec.parse(
      JSON.stringify({
        organization: `org_${'0'.repeat(26)}`,
        account: `acc_${account.repeat(26)}`,
      }),
    )
    if (!parsed.ok) throw new Error('Invalid named test tenant')
    return parsed.value
  }
  const tenant = makeTenant('1')
  const foreignTenant = makeTenant('2')
  const session = `windows-e2-${run}`
  const scope = value(decodeScopeRef({ ref: session }))
  const identity = inProcessPrincipalAuthority()
  const actor = value(identity.issuer.issueSystem({ component: 'sessionWorkPrincipals' }))
  const issue = (within: TenantId, work = session) =>
    value(
      identity.issuer.issueActingForTenant({
        actor,
        tenant: within,
        work: { owner: 'session', work },
      }),
    )
  const principal = issue(tenant)
  const foreignPrincipal = issue(foreignTenant, session + '-foreign')
  const projections = new Map<unknown, LocalToolControlSubject>()
  const origins = new Map<string, string>()
  const scripts = new Set<string>()
  let active = true
  const withinRoot = (path: string): boolean => {
    const tail = relative(workspace, resolve(workspace, path))
    return (
      tail === '' ||
      (!isAbsolute(tail) && tail !== '..' && !tail.startsWith('..\\') && !tail.startsWith('../'))
    )
  }
  const project: LocalToolRuntimeInput['subjects']['project'] = async raw => {
    const checked = await identity.verifier.verify(raw)
    if (!active || checked.kind !== 'verified' || checked.principal.kind !== 'acting-for-tenant')
      return fail({ kind: 'denied', action: 'windows-e2-subject' })
    const p = checked.principal
    if (
      !tenantEquals(p.tenant, tenant) ||
      p.actor.component !== actor.component ||
      p.work.owner !== 'session' ||
      p.work.work !== session
    )
      return fail({ kind: 'denied', action: 'windows-e2-session' })
    const result: LocalToolControlSubject = {
      tenant: p.tenant,
      kind: 'acting-for-tenant',
      actor: { component: 'sessionWorkPrincipals' },
      work: { owner: 'session', work: session },
    }
    projections.set(raw, result)
    return succeed(result)
  }
  const encode: PrincipalCodec<unknown>['encode'] = raw => {
    const projected = projections.get(raw)
    if (!projected) throw new Error('Only a freshly verified principal may be encoded')
    return {
      kind: projected.kind,
      actor: { component: projected.actor.component },
      work: { owner: 'session', work: session },
      tenant: {
        name: 'TenantId',
        organization: { name: 'OrganizationId', text: tenant.organization.text },
        account: { name: 'AccountId', text: tenant.account.text },
      },
    }
  }
  const qualify: ToolAccessGuard<unknown>['qualify'] = async input => {
    const p = await project(input.principal)
    if (
      'failure' in p ||
      !tenantEquals(input.tenant, tenant) ||
      !input.call ||
      ['read-raw', 'read-raw-content'].includes(input.action)
    )
      return { kind: 'denied', reason: 'outside-the-named-test-session' }
    return { kind: 'allowed' }
  }
  const subjects: LocalToolRuntimeInput['subjects'] = {
    project,
    async resolveSessionWork(input) {
      return active && tenantEquals(input.tenant, tenant) && input.session === session
        ? succeed(issue(tenant))
        : fail({ kind: 'denied', action: 'windows-e2-session-binding' })
    },
  }
  const guard: FacilityGuard<unknown> = {
    async authorize(facility, operation, request) {
      if (
        'failure' in (await project(request.access.principal)) ||
        !tenantEquals(request.access.tenant, tenant) ||
        !origins.has(request.origin)
      )
        return 'notAuthorized'
      const cwd: unknown = Reflect.get(request, 'cwd')
      if (cwd !== undefined && (typeof cwd !== 'string' || !withinRoot(cwd))) return 'notAuthorized'
      if (facility === 'files') {
        const path: unknown = Reflect.get(request, 'path')
        if (typeof path === 'string' && !withinRoot(path)) return 'notAuthorized'
      }
      if (facility === 'command' && operation === 'start') {
        const args: unknown = Reflect.get(request, 'args')
        if (!Array.isArray(args) || typeof args.at(-1) !== 'string' || !scripts.has(args.at(-1)))
          return 'notAuthorized'
      }
      if (facility === 'terminal' && operation === 'execute') {
        const script: unknown = Reflect.get(request, 'script')
        if (typeof script !== 'string' || !scripts.has(script)) return 'notAuthorized'
      }
      return 'authorized'
    },
  }
  const naming: LocalToolRuntimeInput['environment']['naming'] = {
    async name(input) {
      if (
        'failure' in (await project(input.principal)) ||
        !tenantEquals(input.tenant, tenant) ||
        !origins.has(input.origin) ||
        !withinRoot(input.path)
      )
        return fail({ kind: 'denied', action: 'name-windows-e2-object' })
      let path = resolve(workspace, input.path)
      if (input.role === 'parent' || input.role === 'ancestor') path = dirname(path)
      for (;;) {
        try {
          return succeed(await hostObjectToken(path))
        } catch {
          if (input.role !== 'ancestor' || path === workspace)
            return fail({
              kind: 'unavailable',
              dependency: 'windows-object-naming',
              diagnostic: 'The exact object could not be named.',
            })
          path = dirname(path)
          if (!withinRoot(path)) return fail({ kind: 'denied', action: 'name-windows-e2-object' })
        }
      }
    },
  }
  return {
    tenant,
    foreignTenant,
    principal,
    foreignPrincipal,
    scope,
    session,
    subjects,
    project,
    qualify,
    access: {
      guard: { qualify },
      start: {
        qualify: async (
          input: Parameters<LocalToolRuntimeInput['access']['start']['qualify']>[0],
        ) =>
          input.call !== null && input.action === 'start'
            ? qualify({ ...input, call: input.call, action: 'write' })
            : { kind: 'denied' as const, reason: 'no-test-invalidation-grant' },
      },
    },
    sourceAuthority: {
      qualify: async (input: {
        principal: unknown
        tenant: TenantId
        consumer: { owner: string; work: string; purpose: string }
      }) =>
        'ok' in (await project(input.principal)) &&
        tenantEquals(input.tenant, tenant) &&
        input.consumer.owner === 'windows-e2-consumer' &&
        input.consumer.work === session &&
        input.consumer.purpose === 'tool-result'
          ? { kind: 'allowed' as const }
          : { kind: 'denied' as const, reason: 'foreign-consumer' },
      samePrincipal: async ({ current, original }: { current: unknown; original: unknown }) => {
        const checked = await project(current)
        return 'ok' in checked && canonicalDigest(encode(current)) === canonicalDigest(original)
          ? { kind: 'allowed' as const }
          : { kind: 'denied' as const, reason: 'different-original-subject' }
      },
    },
    principalCodec: {
      encode,
      decode: (data: Parameters<PrincipalCodec<unknown>['decode']>[0]) => succeed(data),
    },
    guard,
    naming,
    withinRoot,
    origin(origin: OriginRef, call: string) {
      origins.set(origin, call)
    },
    callForOrigin: (origin: OriginRef) => origins.get(origin),
    allowScript(script: string) {
      scripts.add(script)
    },
    active: () => active,
    retire() {
      active = false
    },
    evidence: evidence('windows-e2-grant', {
      tenant: tenantCodec.encode(tenant),
      session,
      workspace,
      scriptPolicy: 'explicit-test-script-allowlist',
      providerBoundary: 'native-host-files-root',
    }),
  }
}

export function witnessStore(store: ToolLedgerStore) {
  const calls = new Map<string, { execution: string; sources: Set<string> }>()
  const wrapped: ToolLedgerStore = {
    durability: store.durability,
    readRecord: (domain, key) => store.readRecord(domain, key),
    commit: input => store.commit(input),
    async read(domain) {
      const answer = await store.read(domain)
      if (answer.kind === 'complete')
        for (const row of answer.records)
          if (row.kind === 'call' && row.call.execution !== null) {
            const key = canonicalDigest([row.call.tenant, row.call.call])
            const execution = canonicalDigest(row.call.execution)
            const old = calls.get(key)
            const current =
              old?.execution === execution ? old : { execution, sources: new Set<string>() }
            current.sources.add(canonicalDigest(row.call.state.source))
            calls.set(key, current)
          }
      return answer
    },
  }
  return {
    store: wrapped,
    check(execution: unknown, source: unknown, key: unknown) {
      const known = calls.get(canonicalDigest(key))
      return (
        known?.execution === canonicalDigest(execution) &&
        known.sources.has(canonicalDigest(source))
      )
    },
  }
}
