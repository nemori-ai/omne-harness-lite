import { lstat, realpath } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { release as osRelease } from 'node:os'
import {
  fileEffects,
  originRef,
  segmentsBelow,
  type FacilityGuard,
  type FacilityKey,
  type FileEffect,
  type FilesScope,
  type IsolationClaim,
  type OriginRef,
  type ScopedFileOperation,
} from '@omne-harness/execution-environment-contract'
import {
  hostObjectToken,
  hostSegmentsBelowRoot,
} from '@omne-harness/execution-environment-host-local'
import { access, tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SchemaProvider } from '@omne-harness/schema-provider'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolCallDirectory, ToolFailure } from '@omne-harness/tool-contract'
import { describedAdoption } from '@omne-harness/tool-contract/provider'
import {
  createEnvironmentResourceLedger,
  createEnvironmentStateStore,
  createRetainedTerminalLedger,
  type EnvironmentStateStore,
} from '@omne-harness/tool-host-local'
import type { LocalToolRuntimeInput } from '@omne-harness/tool-host-local/cordis'
import { environmentNeedSchemaRef } from '@omne-harness/execution-environment-contract'
import { instanceId, type WorkspaceInstances } from '@omne-harness/workspace-contract'
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
  /** The workspace owner now, asked before every placement of a call pinned to an instance. */
  workspaces(): Pick<WorkspaceInstances<unknown>, 'verify'> | undefined
  commitAttempts: number
  schemaProvider: () => SchemaProvider | null
  warn?(text: string): void
}>

const unavailable = (dependency: string, diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency, diagnostic })

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
  return segmentsBelow(canonicalRoot, canonical) === undefined ? 'outside' : 'inside'
}

function textField(request: object, name: string): unknown {
  return Reflect.get(request, name)
}

function memberOf(value: unknown, name: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, name) : null
}

function filePathValues(
  request: object,
  effects: Readonly<{ path: FileEffect; target?: FileEffect }>,
): Array<Readonly<{ value: unknown; effect: FileEffect }>> {
  const values: Array<Readonly<{ value: unknown; effect: FileEffect }>> = []
  const path = textField(request, 'path')
  if (path !== undefined) values.push({ value: path, effect: effects.path })
  const target = textField(request, 'target')
  if (target !== undefined)
    values.push({ value: memberOf(target, 'path'), effect: effects.target ?? effects.path })
  const entries = textField(request, 'entries')
  if (entries !== undefined) {
    if (!Array.isArray(entries)) values.push({ value: null, effect: effects.path })
    else
      for (const entry of entries as unknown[])
        values.push({ value: memberOf(entry, 'path'), effect: effects.path })
  }
  return values
}

async function permits(
  scope: FilesScope,
  effect: FileEffect,
  value: unknown,
  follow: boolean,
): Promise<boolean> {
  if (typeof value !== 'string') return false
  const root = scope[effect]
  if (root === undefined) return isAbsolute(value)
  return (await placeAgainstRoot(root, value, follow)) !== 'outside'
}

const scopedOperation = (operation: string): operation is ScopedFileOperation =>
  Object.hasOwn(fileEffects, operation)

/** A command starts where it may write; a files request reads and writes by its operation; a close does neither. */
export async function confinedToScope(
  scope: FilesScope,
  facility: FacilityKey,
  operation: string,
  request: object,
): Promise<boolean> {
  const cwd = textField(request, 'cwd')
  if (cwd !== undefined && !(await permits(scope, 'write', cwd, true))) return false
  if (facility !== 'files') return true
  if (operation === 'close') {
    const path = textField(request, 'path')
    return (await permits(scope, 'read', path, false)) || permits(scope, 'write', path, false)
  }
  if (!scopedOperation(operation)) return false
  for (const { value, effect } of filePathValues(request, fileEffects[operation]))
    if (!(await permits(scope, effect, value, false))) return false
  return true
}

type NamingResult = Awaited<ReturnType<LocalToolRuntimeInput['environment']['naming']['name']>>

/** The token at a path, its parent, or its nearest ancestor below the root (the top when there is none). */
async function nearestToken(
  root: string | undefined,
  path: string,
  role: 'object' | 'parent' | 'ancestor',
): Promise<NamingResult> {
  const top = async (at: string) =>
    root === undefined ? dirname(at) === at : (await placeAgainstRoot(root, at, false)) === 'root'
  let current = role === 'parent' || role === 'ancestor' ? dirname(path) : path
  for (;;) {
    try {
      return succeed(await hostObjectToken(current))
    } catch {
      if (role !== 'ancestor' || (await top(current)))
        return unavailable('host-object-naming', 'the exact host object could not be named')
      current = dirname(current)
      if (root !== undefined && (await placeAgainstRoot(root, current, false)) === 'outside')
        return fail({ kind: 'denied', action: 'name-host-object' })
    }
  }
}

async function nameUnder(
  scope: FilesScope | undefined,
  input: Readonly<{ path: string; role: 'object' | 'parent' | 'ancestor' }>,
): Promise<NamingResult> {
  for (const effect of ['read', 'write'] as const) {
    if (scope === undefined || !(await permits(scope, effect, input.path, false))) continue
    const root = scope[effect]
    const path = root === undefined ? input.path : resolve(root, input.path)
    return nearestToken(root, path, input.role)
  }
  return fail({ kind: 'denied', action: 'name-host-object' })
}

export type ReleaseEnvironment = Readonly<{
  input: EnvironmentInput
  origins: ReadonlyMap<OriginRef, string>
}>

/** The directory a call is pinned to, after its tenant's standing there is checked now. Null: it may not work there any more, so nothing is inside its fence. */
export async function admittedDirectory(
  workspaces: ReleaseEnvironmentOptions['workspaces'],
  request: Pick<Preparation, 'principal' | 'tenant'> &
    Readonly<{ request: Readonly<{ directory?: ToolCallDirectory }> }>,
): Promise<Outcome<string | null, ToolFailure>> {
  const pinned = request.request.directory
  if (pinned === undefined)
    return unavailable('working-directory', 'the request pins no working directory')
  if (pinned.workspace === null) return succeed(pinned.path)
  const instance = instanceId(pinned.workspace.instance)
  const owner = workspaces()
  if (owner === undefined || instance === null)
    return unavailable('workspace', 'the workspace of the call cannot be asked about')
  const verified = await owner.verify(access(request.principal, request.tenant), {
    workspace: pinned.workspace.id,
    instance,
  })
  switch (verified.kind) {
    case 'attachable':
      return succeed(verified.directory === pinned.path ? pinned.path : null)
    case 'not-permitted':
      return succeed(null)
    case 'instance-unavailable':
      return unavailable('workspace', `the instance of the call is unavailable: ${verified.reason}`)
    case 'unavailable':
      return unavailable('workspace', 'the workspace owner could not verify the call')
  }
}

/** The files scope of a call: below its pinned directory. Null: no environment, fenced into nothing. */
async function fenceOf(
  workspaces: ReleaseEnvironmentOptions['workspaces'],
  request: Preparation,
): Promise<Outcome<FilesScope | null, ToolFailure>> {
  if (request.request.availability.definition.declarations.environment === null)
    return succeed(null)
  const directory = await admittedDirectory(workspaces, request)
  if ('failure' in directory) return directory
  return succeed(directory.ok === null ? null : { read: directory.ok, write: directory.ok })
}

/** The live origins of calls: the call each belongs to, and the files scope it is fenced into. */
function createFences() {
  const origins = new Map<OriginRef, string>()
  const scopes = new Map<OriginRef, FilesScope>()
  return {
    origins,
    scopeOf: (origin: OriginRef): FilesScope | undefined => scopes.get(origin),
    admit(origin: OriginRef, call: string, scope: FilesScope | null): void {
      origins.set(origin, call)
      if (scope !== null) scopes.set(origin, scope)
    },
    settle(call: string): void {
      for (const [origin, owner] of origins)
        if (owner === call) {
          origins.delete(origin)
          scopes.delete(origin)
        }
    },
  }
}

export function createReleaseEnvironment(
  holder: ToolRuntimeHolder,
  identity: ReleaseToolIdentity,
  options: ReleaseEnvironmentOptions,
): ReleaseEnvironment {
  const fences = createFences()
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
    fences.settle(call)
    for (const [key, entry] of ledgerViews) if (entry.call === call) ledgerViews.delete(key)
  })
  holder.residents.set('origins', () => fences.origins.size)
  holder.residents.set('ledgerViews', () => ledgerViews.size)

  const unverified = (where: string, diagnostic: string): void =>
    options.warn?.(`session work principal not verified for ${where}: ${diagnostic}`)

  const guard: FacilityGuard<unknown> = {
    async authorize(facility, operation, request) {
      try {
        const work = await identity.sessionWork(request.access.principal, request.access.tenant)
        if (work.kind === 'unavailable') {
          unverified('the facility guard', work.diagnostic)
          return 'unavailable'
        }
        const scope = fences.scopeOf(request.origin)
        if (work.kind !== 'session' || scope === undefined) return 'notAuthorized'
        return (await confinedToScope(scope, facility, operation, request))
          ? 'authorized'
          : 'notAuthorized'
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
      return nameUnder(work.kind === 'session' ? fences.scopeOf(input.origin) : undefined, input)
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
      const fence = await fenceOf(options.workspaces, request)
      if ('failure' in fence) return fence
      const origin = originRef(`tool:${request.call}:${request.preparation.operation}`)
      fences.admit(origin, callKeyOf(request.tenant, request.call), fence.ok)
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
  return Object.freeze({ input, origins: fences.origins })
}
