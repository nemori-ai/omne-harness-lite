import type { Context } from '@deepseek-ai/cordis'
import type { AgentAdoptions, AgentDefinition } from '@omne-harness/agent-contract'
import { agentAdoptionsKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { PrincipalVerifier } from '@omne-harness/identity'
import { tenantEquals } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  SessionAccess,
  SessionFailure,
  SessionId,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { canonicalDigest } from '@omne-harness/tool'
import type {
  LocalToolCatalogView,
  LocalToolCatalogViewSource,
} from '@omne-harness/tool-host-local'
import { sessionWorkReaderOf } from '../../entry/tool-requests.ts'
import type { ToolDefinition } from '@omne-harness/tool-contract'
import { releaseDefinitionOf, releaseOf, type ToolRelease } from '../../entry/tool-release.ts'
import { toolRuntimeHolder } from '../tool-runtime/holder.ts'
import { verifySessionWork } from '../tool-runtime/session-work.ts'

type CatalogWork = Pick<
  WorkSnapshot,
  'session' | 'tenant' | 'lifecycle' | 'definition' | 'residents' | 'frozen'
>
type Resolved = Awaited<ReturnType<AgentAdoptions<unknown>['resolve']>>
type AdoptionFailure = Extract<Resolved, { failure: unknown }>['failure']

/** Each getter reads the current owning service; absence never grants disclosure. */
export type ReleaseCatalogViewPorts = Readonly<{
  verifier(): PrincipalVerifier | undefined
  readWork(
    access: SessionAccess<unknown>,
  ): Promise<Outcome<CatalogWork, SessionFailure>> | undefined
  resolve(
    input: Parameters<AgentAdoptions<unknown>['resolve']>[0],
  ): Promise<Outcome<Readonly<{ definition: AgentDefinition }>, AdoptionFailure>> | undefined
  release(): ToolRelease
  knownDefinition?(name: string): ToolDefinition | undefined
}>

const unavailable = (diagnostic: string) =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'catalog-view',
    diagnostic,
  })
const denied = () => fail({ kind: 'denied' as const, action: 'catalog-view' })

/** Projects exact adopted references, including nonresidents, onto this release's lawful assets. */
export function createReleaseCatalogView(
  ports: ReleaseCatalogViewPorts,
): LocalToolCatalogViewSource<unknown> {
  return {
    async read(access) {
      try {
        const verified = await verifySessionWork(ports.verifier(), access.principal, access.tenant)
        if (verified.kind === 'unavailable') return unavailable(verified.diagnostic)
        if (verified.kind === 'denied') return denied()
        // The trusted Session work issuer used the Session's own id as its work identity.
        const session = verified.session as SessionId
        const work = await ports.readWork({ ...access, session })
        if (work === undefined) return unavailable('Session absent')
        if ('failure' in work)
          return work.failure.kind === 'denied' ? denied() : unavailable('Session read failed')
        if (work.ok.session !== session || !tenantEquals(work.ok.tenant, access.tenant))
          return denied()
        if (
          work.ok.frozen !== null ||
          (work.ok.lifecycle !== 'active' && work.ok.lifecycle !== 'dormant')
        )
          return unavailable('Session cannot disclose its current tool view')
        const resolved = await ports.resolve({ ...access, adoption: work.ok.definition.adopted })
        if (resolved === undefined || 'failure' in resolved)
          return unavailable('adopted definition unavailable')
        const release = ports.release()
        if (release.kind !== 'trusted') return unavailable('release unavailable')
        const entries: LocalToolCatalogView['entries'][number][] = []
        const residents = new Set(work.ok.residents.map(item => item.capability))
        const references = [
          ...resolved.ok.definition.references,
          ...work.ok.residents.map(item => ({
            capability: { category: 'Tool', name: item.capability },
          })),
        ]
        const seen = new Set<string>()
        for (const reference of references) {
          if (reference.capability.category !== 'Tool' || seen.has(reference.capability.name))
            continue
          seen.add(reference.capability.name)
          const entry = release.manifest.entries.find(
            candidate => candidate.asset.name === reference.capability.name,
          )
          if (entry !== undefined) {
            const knownDefinition = ports.knownDefinition?.(reference.capability.name)
            entries.push({
              key: { layer: { kind: 'official' }, asset: entry.asset },
              resident: residents.has(reference.capability.name),
              ...(knownDefinition === undefined ? {} : { knownDefinition }),
            })
          }
        }
        const identity = {
          tenant: access.tenant,
          session,
          actor: verified.principal.actor,
          work: verified.principal.work,
        }
        return succeed({
          scope: {
            owner: '@omne-harness/harness-server',
            record: `tool-catalog:${session}`,
            revision: '1',
            digest: canonicalDigest(identity),
          },
          revision: canonicalDigest({
            adopted: work.ok.definition.adopted,
            lifecycle: work.ok.lifecycle,
            entries,
          }),
          entries,
        })
      } catch {
        return unavailable('a catalog view source threw')
      }
    },
  }
}

/** Lazy service reads avoid an initialization dependency cycle with Session and Agent. */
export function releaseCatalogViewOf(ctx: Context): LocalToolCatalogViewSource<unknown> {
  return createReleaseCatalogView({
    verifier: () => toolRuntimeHolder(ctx).verifier(),
    readWork: sessionWorkReaderOf(ctx),
    resolve: input => ctx.get(agentAdoptionsKey)?.resolve(input),
    release: () => releaseOf(ctx),
    knownDefinition: name => releaseDefinitionOf(ctx, name),
  })
}
