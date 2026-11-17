import type { Context } from '@deepseek-ai/cordis'
import type { DurableEvidence, EnabledExtensions, Failure } from '@omne-harness/agent-contract'
import type { PrincipalVerifier } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
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
import { toolRuntimeHolder } from '../rows/tool-runtime/holder.ts'
import { verifySessionWork } from '../rows/tool-runtime/session-work.ts'

const OWNER = 'agentEnabledExtensions'

export type EnabledExtensionsPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  views(): PublishedViewPorts | null
}>

const unavailable = (diagnostic: string): Outcome<never, Failure> =>
  fail({ kind: 'unavailable', owner: OWNER, diagnostic })

async function sessionOf(
  ports: Pick<EnabledExtensionsPorts, 'verifier'>,
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

/** The Agent port of the tenant-enabled extensions: the coordinator reads the block of the session, the loop-extension rules pick the members of the position. Unreadable is unavailable, never an empty chain. */
export function createEnabledExtensions(ports: EnabledExtensionsPorts): EnabledExtensions<unknown> {
  return {
    async read(input) {
      const session = await sessionOf(ports, input.principal, input.tenant)
      if ('failure' in session) return session
      const views = ports.views()
      if (views === null) return unavailable('the Session or Runtime Context services are absent')
      const access = { principal: input.principal, tenant: input.tenant, session: session.ok }
      const read = await readCoordinatorNeed(views, access, {
        key: enabledExtensionsBinding.key,
        need: enabledExtensionsBinding.need.name,
      })
      if ('failure' in read) return unavailable(read.failure)
      const view = viewOf(read.ok)
      if (view === undefined)
        return unavailable('the block is not a view of the enabled extensions')
      const { position, dimension } = input
      return succeed({ members: membersAt(view, { position, dimension }), basis: basisOf(view) })
    },
  }
}

export function enabledExtensionsOf(ctx: Context): EnabledExtensions<unknown> {
  return createEnabledExtensions({
    verifier: () => toolRuntimeHolder(ctx).verifier(),
    views: () => publishedViewPortsOf(ctx),
  })
}

export type RunLocationPorts = Pick<EnabledExtensionsPorts, 'verifier'> &
  Readonly<{
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
