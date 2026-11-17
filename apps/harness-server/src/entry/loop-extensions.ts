import type { Context } from '@deepseek-ai/cordis'
import type { DurableEvidence, EnabledExtensions, Failure } from '@omne-harness/agent-contract'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { membersAt } from '@omne-harness/loop-extension'
import {
  enabledExtensionsBinding,
  enabledExtensionsDescriptor,
  type EnabledExtensionsView,
  type RunLocation,
} from '@omne-harness/loop-extension-contract'
import { RunLocationsService } from '@omne-harness/loop-extension-cordis-contract/cordis'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type { SessionId } from '@omne-harness/session-contract'
import { contentDigest } from '../rows/agent-adoptions/definition-mappings.ts'
import {
  publishedViewPortsOf,
  readCoordinatorNeed,
  type PublishedViewPorts,
} from '../rows/session-ad03/published-view.ts'
import { sessionWorkOf, verifySessionWork } from '../rows/tool-runtime/session-work.ts'

const OWNER = 'agentEnabledExtensions'

export type EnabledExtensionsPorts = Readonly<{ views(): PublishedViewPorts | null }>

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

function viewOf(value: unknown): EnabledExtensionsView | undefined {
  const judged = enabledExtensionsDescriptor.schema['~standard'].validate(value)
  return 'value' in judged ? judged.value : undefined
}

const basisOf = (view: EnabledExtensionsView): DurableEvidence => ({
  owner: 'loop-extension',
  record: 'enabled-extensions',
  revision: `${view.basis.assets}/${view.basis.settings}`,
  digest: contentDigest(view),
})

const KNOWN_SCOPES = 4096

/** The Agent port of the tenant-enabled extensions. Unreadable is unavailable, never an empty chain. The session comes from the shape of the principal: the read verifies it. */
export function createEnabledExtensions(ports: EnabledExtensionsPorts): EnabledExtensions<unknown> {
  // A hint: the scope the last read of a session used.
  const scopes = new Map<string, ScopeRef>()
  return {
    async read(input) {
      const work = sessionWorkOf(input.principal, input.tenant)
      const tenant = tenantCodec.encode(input.tenant)
      if (work === undefined || !tenant.ok)
        return fail({ kind: 'denied', action: 'enabled-extensions' })
      const views = ports.views()
      if (views === null) return unavailable('the Session or Runtime Context services are absent')
      const session = work.session as SessionId
      const key = `${tenant.value}|${session}`
      const access = { principal: input.principal, tenant: input.tenant, session }
      const asked = { key: enabledExtensionsBinding.key, need: enabledExtensionsBinding.need.name }
      const read = await readCoordinatorNeed(views, access, asked, scopes.get(key))
      if ('failure' in read) {
        scopes.delete(key)
        return unavailable(read.failure)
      }
      if (scopes.size >= KNOWN_SCOPES && !scopes.has(key)) scopes.clear()
      scopes.set(key, read.ok.scope)
      const view = viewOf(read.ok.value)
      if (view === undefined)
        return unavailable('the block is not a view of the enabled extensions')
      const { position, dimension } = input
      return succeed({ members: membersAt(view, { position, dimension }), basis: basisOf(view) })
    },
  }
}

export function enabledExtensionsOf(ctx: Context): EnabledExtensions<unknown> {
  return createEnabledExtensions({ views: () => publishedViewPortsOf(ctx) })
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
