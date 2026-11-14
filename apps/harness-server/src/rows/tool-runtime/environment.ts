import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { release as osRelease } from 'node:os'
import {
  originRef,
  type FacilityGuard,
  type FacilityKey,
  type IsolationClaim,
  type OriginRef,
} from '@omne-harness/execution-environment-contract'
import {
  hostObjectToken,
  hostSegmentsBelowRoot,
} from '@omne-harness/execution-environment-host-local'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SchemaProvider } from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import {
  createEnvironmentResourceLedger,
  createEnvironmentStateStore,
  createRetainedTerminalLedger,
  type EnvironmentStateStore,
} from '@omne-harness/tool-host-local'
import type { LocalToolRuntimeInput } from '@omne-harness/tool-host-local/cordis'
import { environmentNeedSchemaRef } from '@omne-harness/execution-environment-contract'
import { readEnvironmentNeed } from '../tool-host/release-author.ts'
import type { ReleaseToolIdentity } from './access.ts'
import { callKeyOf, lateStore, type ToolRuntimeHolder } from './holder.ts'

type EnvironmentInput = LocalToolRuntimeInput['environment']
type Preparation = Parameters<EnvironmentInput['plan']['ledger']>[0]

export const RELEASE_ENVIRONMENT_ADOPTION = describedAdoption({
  owner: '@omne-harness/harness-server',
  name: 'host-machine-environment',
  revision: '1',
})

export type ReleaseEnvironmentOptions = Readonly<{
  filesRoot: string
  commitAttempts: number
  schemaProvider: () => SchemaProvider | null
  warn?(text: string): void
}>

const unavailable = (dependency: string, diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency, diagnostic })

export function withinRoot(root: string, path: string): boolean {
  const tail = relative(root, resolve(root, path))
  return (
    tail === '' ||
    (!isAbsolute(tail) && tail !== '..' && !tail.startsWith('..\\') && !tail.startsWith('../'))
  )
}

const missingCodes = new Set(['ENOENT', 'ENOTDIR'])

function missing(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null ? Reflect.get(error, 'code') : undefined
  return typeof code === 'string' && missingCodes.has(code)
}

async function canonicalPath(path: string, follow: boolean): Promise<string | undefined> {
  const rest: string[] = []
  let current = path
  if (!follow)
    try {
      if ((await lstat(current)).isSymbolicLink()) {
        rest.unshift(basename(current))
        current = dirname(current)
      }
    } catch (error) {
      if (!missing(error)) return undefined
    }
  for (;;)
    try {
      return join(await realpath(current), ...rest)
    } catch (error) {
      const up = dirname(current)
      if (!missing(error) || up === current) return undefined
      rest.unshift(basename(current))
      current = up
    }
}

export async function placeAgainstRoot(
  root: string,
  path: string,
  follow: boolean,
): Promise<'root' | 'inside' | 'outside'> {
  const target = resolve(root, path)
  const below = await hostSegmentsBelowRoot(root, target)
  if (below === undefined) return 'outside'
  if (below.length === 0) return 'root'
  const [canonicalRoot, canonical] = await Promise.all([
    canonicalPath(resolve(root), true),
    canonicalPath(target, follow),
  ])
  if (canonicalRoot === undefined || canonical === undefined) return 'outside'
  if (!withinRoot(canonicalRoot, canonical)) return 'outside'
  return 'inside'
}

function textField(request: object, name: string): unknown {
  return Reflect.get(request, name)
}

function memberOf(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : null
}

function filePathValues(request: object): unknown[] {
  const values: unknown[] = []
  const path = textField(request, 'path')
  if (path !== undefined) values.push(path)
  const target = textField(request, 'target')
  if (target !== undefined) values.push(memberOf(target, 'path'))
  const entries = textField(request, 'entries')
  if (entries !== undefined) {
    if (!Array.isArray(entries)) values.push(null)
    else for (const entry of entries as unknown[]) values.push(memberOf(entry, 'path'))
  }
  return values
}

export async function confinedToRoot(
  root: string,
  facility: FacilityKey,
  request: object,
): Promise<boolean> {
  const cwd = textField(request, 'cwd')
  const checks: Array<Readonly<{ value: unknown; follow: boolean }>> =
    cwd === undefined ? [] : [{ value: cwd, follow: true }]
  if (facility === 'files')
    for (const value of filePathValues(request)) checks.push({ value, follow: false })
  for (const { value, follow } of checks)
    if (typeof value !== 'string' || (await placeAgainstRoot(root, value, follow)) === 'outside')
      return false
  return true
}

type NamingResult = Awaited<ReturnType<LocalToolRuntimeInput['environment']['naming']['name']>>

async function nearestToken(
  root: string,
  path: string,
  role: 'object' | 'parent' | 'ancestor',
): Promise<NamingResult> {
  let current = role === 'parent' || role === 'ancestor' ? dirname(path) : path
  for (;;) {
    try {
      return succeed(await hostObjectToken(current))
    } catch {
      if (role !== 'ancestor' || (await placeAgainstRoot(root, current, false)) === 'root')
        return unavailable('host-object-naming', 'the exact host object could not be named')
      current = dirname(current)
      if ((await placeAgainstRoot(root, current, false)) === 'outside')
        return fail({ kind: 'denied', action: 'name-host-object' })
    }
  }
}

export type ReleaseEnvironment = Readonly<{
  input: EnvironmentInput
  origins: ReadonlyMap<OriginRef, string>
}>

export function createReleaseEnvironment(
  holder: ToolRuntimeHolder,
  identity: ReleaseToolIdentity,
  options: ReleaseEnvironmentOptions,
): ReleaseEnvironment {
  const root = options.filesRoot
  const origins = new Map<OriginRef, string>()
  const state: EnvironmentStateStore = createEnvironmentStateStore({
    store: lateStore(holder),
    mode: 'production',
    commitAttempts: options.commitAttempts,
  })

  const currentAccess = async (request: Preparation) => {
    const verdict = await identity.access.guard.qualify({
      principal: request.principal,
      tenant: request.tenant,
      call: request.call,
      action: 'write',
    })
    return verdict.kind === 'allowed'
      ? ('authorized' as const)
      : verdict.kind === 'denied'
        ? ('notAuthorized' as const)
        : ('unavailable' as const)
  }

  const ledgerViews = new Map<string, { call: string; view: ReturnType<typeof openLedgers> }>()
  function openLedgers(request: Preparation) {
    return (async () => {
      const input = {
        state,
        address: request.preparation,
        authorize: () => currentAccess(request),
      }
      const regular = await createEnvironmentResourceLedger(input)
      const retained = await createRetainedTerminalLedger({
        ...input,
        scope: request.request.requesterScope,
      })
      return { regular, retained }
    })()
  }
  const ledgers = (request: Preparation) => {
    const key = canonicalDigest([request.tenant, request.call, request.preparation.operation])
    const found = ledgerViews.get(key)
    if (found !== undefined) return found.view
    const view = openLedgers(request)
    const entry = { call: callKeyOf(request.tenant, request.call), view }
    ledgerViews.set(key, entry)
    view.catch(() => {
      if (ledgerViews.get(key) === entry) ledgerViews.delete(key)
    })
    return view
  }

  holder.settled.add(call => {
    for (const [origin, owner] of origins) if (owner === call) origins.delete(origin)
    for (const [key, entry] of ledgerViews) if (entry.call === call) ledgerViews.delete(key)
  })
  holder.residents.set('origins', () => origins.size)
  holder.residents.set('ledgerViews', () => ledgerViews.size)

  const unverified = (where: string, diagnostic: string): void =>
    options.warn?.(`session work principal not verified for ${where}: ${diagnostic}`)

  const guard: FacilityGuard<unknown> = {
    async authorize(facility, _operation, request) {
      try {
        const work = await identity.sessionWork(request.access.principal, request.access.tenant)
        if (work.kind === 'unavailable') {
          unverified('the facility guard', work.diagnostic)
          return 'unavailable'
        }
        if (work.kind !== 'session' || !origins.has(request.origin)) return 'notAuthorized'
        return (await confinedToRoot(root, facility, request)) ? 'authorized' : 'notAuthorized'
      } catch {
        return 'unavailable'
      }
    },
  }

  const naming: EnvironmentInput['naming'] = {
    async name(input) {
      const work = await identity.sessionWork(input.principal, input.tenant)
      if (work.kind === 'unavailable') {
        unverified('the host object naming', work.diagnostic)
        return unavailable('principalVerifier', work.diagnostic)
      }
      if (
        work.kind !== 'session' ||
        !origins.has(input.origin) ||
        (await placeAgainstRoot(root, input.path, false)) === 'outside'
      )
        return fail({ kind: 'denied', action: 'name-host-object' })
      return nearestToken(root, resolve(root, input.path), input.role)
    },
  }

  const plan: EnvironmentInput['plan'] = {
    async requirement(request) {
      if (request.request.availability.definition.declarations.environment === null)
        return succeed({
          allowedBindings: [{ kind: 'host_machine' as const }],
          facilities: [],
          isolation: [],
        })
      const provider = options.schemaProvider()
      if (provider === null)
        return unavailable('tool-environments', 'the environment schema provider is not installed')
      const need = await readEnvironmentNeed(request.request.availability.definition, {
        provider,
        schema: environmentNeedSchemaRef,
      })
      if ('failure' in need) return need
      if (need.ok === null || !need.ok.layers.includes('host_machine'))
        return fail({ kind: 'denied', action: 'host-machine-placement' })
      return succeed({
        allowedBindings: [{ kind: 'host_machine' }],
        facilities: need.ok.facilities as readonly FacilityKey[],
        isolation: need.ok.isolation as readonly IsolationClaim[],
      })
    },
    async binding(request) {
      if (!tenantCodec.encode(request.tenant).ok)
        return fail({ kind: 'denied', action: 'environment-binding' })
      const origin = originRef(`tool:${request.call}:${request.preparation.operation}`)
      origins.set(origin, callKeyOf(request.tenant, request.call))
      const view = await ledgers(request)
      const scope = request.request.requesterScope
      return succeed({
        origin,
        scope,
        retention: { scope, ledger: view.retained, processes: view.retained },
      })
    },
    guard,
    ledger: async request => (await ledgers(request)).regular,
    async facts(placement) {
      if (placement.binding.kind !== 'host_machine')
        return unavailable('execution-host', 'the placement is not the host machine')
      return succeed({
        system: process.platform,
        release: osRelease(),
        architecture: process.arch,
        facilities: placement.requirement.facilities,
      })
    },
  }

  const input: EnvironmentInput = {
    adoption: RELEASE_ENVIRONMENT_ADOPTION,
    naming,
    cleanup: {
      settle: async () =>
        succeed({
          kind: 'pending',
          diagnostic:
            'Cold Tool acquisition cleanup is not part of wave 2; the original stays owned.',
        }),
    },
    plan,
  }
  return Object.freeze({ input, origins })
}
