import { readFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context, Logger } from '@deepseek-ai/cordis'
import { tenantCodec, tenantEquals, type Access, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import type { ToolAuthority } from '@omne-harness/tool-contract/provider'
import {
  ToolContributionAuthorityService,
  toolContributionAuthorityKey,
  type ToolContributionAuthority,
  type VerifiedAuthority,
} from '@omne-harness/tool-cordis-contract/cordis'
import { pauseAfterFailures } from '../retry-pause.ts'
import { monotonicClock } from '../shutdown.ts'
import type { EntryEnv, EntryObjectModule } from '../types.ts'
import { issueEntrySystemPrincipal } from './agent-host-principal.ts'
import {
  importReleaseModules,
  loadToolRelease,
  sameAdoption,
  sameEvidence,
  locateToolDefinitions,
  type ReleaseModules,
  type ToolReleaseManifest,
  type ToolReleaseSnapshot,
} from './tool-release-manifest.ts'

export const TOOL_RELEASE_REGISTRANT_KEY = 'toolReleaseRegistrant'
export const TOOL_RELEASE_COMPONENT = 'toolReleaseRegistrant'

export const TOOL_RELEASE_TENANT: TenantId = (() => {
  const parsed = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_00000000000000000000000000',
      account: 'acc_00000000000000000000000000',
    }),
  )
  if (!parsed.ok) throw new Error('tool-release: the release tenant text is invalid')
  return parsed.value
})()

export const TOOL_RELEASE_LOGGER = 'tool-release'

export type ToolReleaseRegistrant = Access<unknown>

export type ToolRelease =
  | Readonly<{
      kind: 'trusted'
      generation: string
      manifest: ToolReleaseManifest
      modules: ReleaseModules
    }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

type Bound = Readonly<{ access: ToolReleaseRegistrant; generation: string | null }>
type ReleaseState = {
  current: ToolReleaseSnapshot | null
  loading: Promise<ToolReleaseSnapshot> | null
  failures: number
  retryAt: number
  registrant: Bound | null
  logger: Logger | null
}

const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, diagnostic: `toolContributionAuthority: ${diagnostic}` })

function isOfficial(layer: unknown): boolean {
  return (
    typeof layer === 'object' &&
    layer !== null &&
    Reflect.get(layer, 'kind') === 'official' &&
    Object.keys(layer).length === 1
  )
}

type Trusted = Extract<ToolRelease, { kind: 'trusted' }>
type Verify = ToolContributionAuthority<unknown>['verify']
type Admits = ToolContributionAuthority<unknown>['admits']

function entryNamed(release: Trusted, asset: unknown) {
  const name = typeof asset === 'object' && asset !== null ? Reflect.get(asset, 'name') : null
  return release.manifest.entries.find(candidate => candidate.asset.name === name)
}

function mismatchOf(
  authority: ToolAuthority,
  entry: Trusted['manifest']['entries'][number],
  generation: string,
): string | null {
  if (!sameAdoption(Reflect.get(authority.asset, 'adoption'), entry.asset.adoption))
    return 'asset adoption differs from the release'
  if (!sameEvidence(authority.holding, entry.holding)) return 'holding differs from the release'
  if (!sameEvidence(authority.publication, entry.publication))
    return 'publication differs from the release'
  if (authority.holding.revision !== generation || authority.publication.revision !== generation)
    return 'release generation differs'
  return null
}

function verifyAgainst(release: Trusted, authority: ToolAuthority): ReturnType<Verify> {
  if (!isOfficial(authority.layer)) return fail({ kind: 'denied' })
  const entry = entryNamed(release, authority.asset)
  if (entry === undefined) return fail({ kind: 'denied' })
  const reason = mismatchOf(authority, entry, release.generation)
  if (reason !== null) return fail({ kind: 'invalid', reason })
  // The verified value is built from the snapshot, never from the caller's object.
  const verified: ToolAuthority = Object.freeze({
    layer: Object.freeze({ kind: 'official' as const }),
    asset: entry.asset,
    holding: entry.holding,
    publication: entry.publication,
  })
  return succeed(verified as VerifiedAuthority)
}

function isRegistrant(access: Access<unknown>, bound: Bound): boolean {
  return (
    access.principal === bound.access.principal &&
    tenantCodec.encode(access.tenant).ok &&
    tenantEquals(access.tenant, bound.access.tenant)
  )
}

function admitsAgainst(
  release: Trusted,
  bound: Bound | null,
  access: Access<unknown>,
  layer: unknown,
): ReturnType<Admits> {
  if (!isOfficial(layer)) return fail({ kind: 'denied' })
  if (bound === null) return unavailable('the release registrant is not installed')
  if (bound.generation !== release.generation || !isRegistrant(access, bound))
    return fail({ kind: 'denied' })
  return succeed(undefined)
}

export class ReleaseToolContributionAuthority extends ToolContributionAuthorityService<unknown> {
  readonly verify: Verify
  readonly admits: Admits
  readonly release: () => ToolRelease

  constructor(
    ctx: Context,
    snapshot: ToolReleaseSnapshot | (() => ToolReleaseSnapshot),
    registrant: () => Bound | null,
  ) {
    super(ctx)
    const current = typeof snapshot === 'function' ? snapshot : () => snapshot
    let last: { from: ToolReleaseSnapshot; release: ToolRelease } | undefined
    const releaseNow = (): ToolRelease => {
      const from = current()
      if (last?.from === from) return last.release
      const release: ToolRelease =
        from.kind === 'trusted'
          ? Object.freeze({
              kind: 'trusted',
              generation: from.generation,
              manifest: from.manifest,
              modules: from.modules,
            })
          : Object.freeze({ kind: 'unavailable', diagnostic: from.diagnostic })
      last = { from, release }
      return release
    }
    this.release = releaseNow
    this.verify = authority => {
      const release = releaseNow()
      if (release.kind !== 'trusted') return unavailable('release snapshot unavailable')
      try {
        return verifyAgainst(release, authority)
      } catch {
        return fail({ kind: 'invalid', reason: 'authority is unreadable' })
      }
    }
    this.admits = (access, layer) => {
      const release = releaseNow()
      if (release.kind !== 'trusted') return unavailable('release snapshot unavailable')
      try {
        return admitsAgainst(release, registrant(), access, layer)
      } catch {
        return fail({ kind: 'denied' })
      }
    }
  }
}

export function releaseOf(ctx: Context): ToolRelease {
  const service: unknown = ctx.get(toolContributionAuthorityKey)
  return service instanceof ReleaseToolContributionAuthority
    ? service.release()
    : Object.freeze({ kind: 'unavailable', diagnostic: 'no release contribution authority' })
}

export function registrantOf(ctx: Context): ToolReleaseRegistrant | undefined {
  const value: unknown = ctx.get(TOOL_RELEASE_REGISTRANT_KEY)
  if (typeof value !== 'object' || value === null) return undefined
  const principal: unknown = Reflect.get(value, 'principal')
  const tenant: unknown = Reflect.get(value, 'tenant')
  return principal === undefined || tenant === undefined
    ? undefined
    : (value as ToolReleaseRegistrant)
}

const MEMBER_DIR = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

export function productionReleaseInput(): Parameters<typeof loadToolRelease>[0] {
  return {
    manifestPath: fileURLToPath(new URL('../../config/tool-release.json', import.meta.url)),
    packageRoot: () => locateToolDefinitions(MEMBER_DIR),
    version: async () => {
      const manifest: unknown = JSON.parse(
        await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
      )
      const version: unknown =
        typeof manifest === 'object' && manifest !== null
          ? Reflect.get(manifest, 'version')
          : undefined
      if (typeof version !== 'string') throw new Error('harness-server has no version')
      return version
    },
    // Imported only after the artifacts matched, from the same root; never a path from a caller.
    importModules: importReleaseModules,
  }
}

export const loadProductionRelease = (): Promise<ToolReleaseSnapshot> =>
  loadToolRelease(productionReleaseInput())

type ReleaseEntriesOptions = Readonly<{
  now?(): number
  retryPauseMs?(failures: number): number
}>

export function createToolReleaseEntries(
  load: () => Promise<ToolReleaseSnapshot> = loadProductionRelease,
  options: ReleaseEntriesOptions = {},
): Readonly<{ registrant: EntryObjectModule; authority: EntryObjectModule }> {
  const key = Symbol('harness-server/tool-release')
  const now = () => options.now?.() ?? monotonicClock.now()
  const create = (): ReleaseState => ({
    current: null,
    loading: null,
    failures: 0,
    retryAt: 0,
    registrant: null,
    logger: null,
  })
  const stateOf = (env: EntryEnv) => env.once(key, create)

  const attempt = (state: ReleaseState): Promise<ToolReleaseSnapshot> => {
    state.loading ??= (async () => {
      let snapshot: ToolReleaseSnapshot
      let reason: string
      try {
        snapshot = await load()
        reason = snapshot.kind === 'trusted' ? '' : snapshot.diagnostic
      } catch (error) {
        reason = error instanceof Error ? error.message : 'unreadable'
        snapshot = Object.freeze({
          kind: 'unavailable' as const,
          diagnostic: 'release load failed',
        })
      }
      if (snapshot.kind === 'trusted') {
        state.failures = 0
        if (state.registrant !== null)
          state.registrant = Object.freeze({
            access: state.registrant.access,
            generation: snapshot.generation,
          })
      } else {
        state.failures += 1
        const againInMs = Math.max(0, (options.retryPauseMs ?? pauseAfterFailures)(state.failures))
        state.retryAt = now() + againInMs
        state.logger?.warn(
          'tool release read failed: %s; tool contributions are refused; reading again in %d ms',
          reason,
          againInMs,
        )
      }
      state.current = snapshot
      state.loading = null
      return snapshot
    })()
    return state.loading
  }
  const snapshotOf = (scope: Context, env: EntryEnv) => {
    const state = stateOf(env)
    state.logger ??= scope.logger(TOOL_RELEASE_LOGGER)
    return state.current ?? attempt(state)
  }
  const currentOf = (state: ReleaseState): ToolReleaseSnapshot => {
    const current = state.current
    if (current === null) return Object.freeze({ kind: 'unavailable', diagnostic: 'not read yet' })
    if (current.kind === 'unavailable' && state.loading === null && now() >= state.retryAt)
      void attempt(state)
    return current
  }
  return Object.freeze({
    registrant: {
      name: TOOL_RELEASE_REGISTRANT_KEY,
      implementation: 'real',
      async install(scope, env) {
        const principal = issueEntrySystemPrincipal(env, TOOL_RELEASE_COMPONENT)
        const access: ToolReleaseRegistrant = Object.freeze({
          principal,
          tenant: TOOL_RELEASE_TENANT,
        })
        const snapshot = await snapshotOf(scope, env)
        stateOf(env).registrant = Object.freeze({
          access,
          generation: snapshot.kind === 'trusted' ? snapshot.generation : null,
        })
        scope.provide(TOOL_RELEASE_REGISTRANT_KEY, access)
      },
    },
    authority: {
      name: toolContributionAuthorityKey,
      implementation: 'real',
      async install(scope, env) {
        await snapshotOf(scope, env)
        const state = stateOf(env)
        new ReleaseToolContributionAuthority(
          scope,
          () => currentOf(state),
          () => state.registrant,
        )
      },
    },
  })
}

const release = createToolReleaseEntries()
export const toolReleaseRegistrant: EntryObjectModule = release.registrant
export const toolContributionAuthority: EntryObjectModule = release.authority

const knownDefinitions = new WeakMap<
  Context,
  { generation: string; entries: Map<string, ToolDefinition> }
>()

export function rememberReleaseDefinition(
  ctx: Context,
  generation: string,
  definition: ToolDefinition,
): boolean {
  const release = releaseOf(ctx)
  if (release.kind !== 'trusted' || release.generation !== generation) return false
  const entry = release.manifest.entries.find(item => item.asset.name === definition.name)
  if (entry === undefined || entry.definition !== canonicalDigest(definition)) return false
  let known = knownDefinitions.get(ctx.root)
  if (known?.generation !== generation) {
    known = { generation, entries: new Map() }
    knownDefinitions.set(ctx.root, known)
  }
  known.entries.set(definition.name, structuredClone(definition))
  return true
}

export function releaseDefinitionOf(ctx: Context, name: string): ToolDefinition | undefined {
  const release = releaseOf(ctx)
  const known = knownDefinitions.get(ctx.root)
  if (release.kind !== 'trusted' || known?.generation !== release.generation) return undefined
  const definition = known.entries.get(name)
  return definition === undefined ? undefined : structuredClone(definition)
}
