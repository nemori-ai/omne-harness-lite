import type { Context } from '@deepseek-ai/cordis'
import type { DurableEvidence, EnabledExtensions, Failure } from '@omne-harness/agent-contract'
import type { PrincipalVerifier } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import { membersAt } from '@omne-harness/loop-extension'
import {
  ENABLED_EXTENSIONS_BLOCK,
  ENABLED_EXTENSIONS_REQUEST,
  enabledExtensionsDescriptor,
  type EnabledExtensionsView,
  type RunLocation,
} from '@omne-harness/loop-extension-contract'
import { RunLocationsService } from '@omne-harness/loop-extension-cordis-contract/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ScopeRef, StaticScopeHolder } from '@omne-harness/runtime-context-contract'
import type { SessionId } from '@omne-harness/session-contract'
import { contentDigest } from '../rows/agent-adoptions/definition-mappings.ts'
import { sessionWorkOf, verifySessionWork } from '../rows/tool-runtime/session-work.ts'

const OWNER = 'agentEnabledExtensions'

export type EnabledExtensionsPorts = Readonly<{
  scope(): Pick<StaticScopeHolder<unknown>, 'read'> | undefined
  principal(tenant: TenantId): unknown
}>

const unavailable = (diagnostic: string): Outcome<never, Failure> =>
  fail({ kind: 'unavailable', owner: OWNER, diagnostic })

async function sessionOf(
  ports: Pick<RunLocationPorts, 'verifier'>,
  principal: unknown,
  tenant: TenantId,
): Promise<Outcome<SessionId, Failure>> {
  const verdict = await verifySessionWork(ports.verifier(), principal, tenant)
  if (verdict.kind === 'unavailable') return unavailable(verdict.diagnostic)
  return verdict.kind === 'denied'
    ? fail({ kind: 'denied', action: 'enabled-extensions' })
    : succeed(verdict.session as SessionId)
}

function viewOfValue(value: unknown): EnabledExtensionsView | undefined {
  const judged = enabledExtensionsDescriptor.schema['~standard'].validate(value)
  return 'value' in judged ? judged.value : undefined
}

const basisOf = (view: EnabledExtensionsView): DurableEvidence => ({
  owner: 'loop-extension',
  record: 'enabled-extensions',
  revision: `${view.basis.assets}/${view.basis.settings}`,
  digest: contentDigest(view),
})

async function viewOfTenant(
  ports: EnabledExtensionsPorts,
  tenant: TenantId,
): Promise<Outcome<EnabledExtensionsView, Failure>> {
  const scope = ports.scope()
  const principal = ports.principal(tenant)
  if (scope === undefined) return unavailable('the holder of the tenant-level scope is not there')
  if (principal === undefined) return unavailable('no principal reads the tenant-level scope now')
  const read = await scope.read(principal, tenant, ENABLED_EXTENSIONS_REQUEST)
  if ('failure' in read) return unavailable(`the tenant-level scope: ${read.failure.kind}`)
  const entry = read.ok.entries.find(item => item.key === ENABLED_EXTENSIONS_BLOCK)
  const view = entry?.kind === 'value' ? viewOfValue(entry.value) : undefined
  return view === undefined
    ? unavailable(`the block read as ${entry?.kind ?? 'missing'}`)
    : succeed(view)
}

// The view is a fact of the tenant: read from the tenant-level scope, for the work of a session of
// this tenant. Unreadable is unavailable, never an empty chain.
export function createEnabledExtensions(ports: EnabledExtensionsPorts): EnabledExtensions<unknown> {
  return {
    async read(input) {
      if (sessionWorkOf(input.principal, input.tenant) === undefined)
        return fail({ kind: 'denied', action: 'enabled-extensions' })
      try {
        const view = await viewOfTenant(ports, input.tenant)
        if ('failure' in view) return view
        const { position, dimension } = input
        return succeed({
          members: membersAt(view.ok, { position, dimension }),
          basis: basisOf(view.ok),
        })
      } catch (cause) {
        return unavailable(
          `the read threw: ${cause instanceof Error ? cause.message : String(cause)}`,
        )
      }
    },
  }
}

export type RunLocationPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  /** The current context scope of the session, checked to be bound to this tenant. */
  scope(
    tenant: TenantId,
    principal: unknown,
    session: SessionId,
  ): Promise<Outcome<ScopeRef, Failure>>
  workspace(): string | undefined
}>

/** Where a command implementation runs for one call: the scope is that of the session, the directory is the workspace. */
export async function runLocationOf(
  ports: RunLocationPorts,
  input: Readonly<{ principal: unknown; tenant: TenantId }>,
): Promise<RunLocation> {
  const cwd = ports.workspace()
  const session = await sessionOf(ports, input.principal, input.tenant)
  if (cwd === undefined || 'failure' in session) return { kind: 'unavailable' }
  const scope = await ports.scope(input.tenant, input.principal, session.ok)
  return 'failure' in scope ? { kind: 'unavailable' } : { kind: 'location', scope: scope.ok, cwd }
}

export class EntryRunLocations extends RunLocationsService<unknown> {
  private readonly ports: RunLocationPorts
  constructor(ctx: Context, ports: RunLocationPorts) {
    super(ctx)
    this.ports = ports
  }
  of(input: Parameters<RunLocationsService<unknown>['of']>[0]) {
    return runLocationOf(this.ports, input)
  }
}
