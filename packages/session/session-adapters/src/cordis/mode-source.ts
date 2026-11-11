import { tenantCodec } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import type { SessionAccess, SessionFailure, WorkSnapshot } from '@omne-harness/session-contract'
import {
  SESSION_PERMISSION_MODE_HANDLER,
  decodeSessionPermissionMode,
} from '@omne-harness/session-storage-sql/participants'
import type { SqlStorage, TenantDomainLookup } from '@omne-harness/sql-contract'
import { createSessionModesPublication, type SessionModeDefaults } from '../mode-publication.ts'
import type { SessionModesPublication } from '../mode-publication-schema.ts'
import type { SessionConditionsInput } from './conditions.ts'

export type SessionModesSourcePorts<P> = Readonly<{
  readWork(access: SessionAccess<P>): Promise<Outcome<WorkSnapshot, SessionFailure>>
  storage: Pick<SqlStorage, 'read'>
  domains: TenantDomainLookup
  defaultModes: SessionConditionsInput['defaultModes']
}>

export type SessionModesObservation =
  | Readonly<{
      kind: 'ready'
      value: SessionModesPublication
      scopes: NonNullable<WorkSnapshot['contextScopes']>
    }>
  | Readonly<{ kind: 'refused' | 'unavailable' }>

export function createSessionModesSource<P>(ports: SessionModesSourcePorts<P>) {
  async function defaults(work: WorkSnapshot): Promise<SessionModeDefaults> {
    const adopted = work.creation.modes
    if (adopted.kind === 'explicit') return { kind: 'unavailable' }
    const result = await ports.defaultModes({
      tenant: work.tenant,
      session: work.session,
      definition: work.definition,
      source: adopted.source,
    })
    return 'failure' in result
      ? { kind: 'unavailable' }
      : {
          kind: 'available',
          adoption: adopted.source,
          modes: result.ok.modes,
          source: result.ok.basis,
        }
  }

  async function read(access: SessionAccess<P>): Promise<SessionModesObservation> {
    const observed = await ports.readWork(access)
    if ('failure' in observed)
      return { kind: observed.failure.kind === 'denied' ? 'refused' : 'unavailable' }
    const work = observed.ok
    const tenant = tenantCodec.encode(access.tenant)
    if (!tenant.ok) return { kind: 'unavailable' }
    const domain = await ports.domains.lookup({ tenant: tenant.value })
    if (domain.kind !== 'ready') return { kind: 'unavailable' }
    const result = await ports.storage.read({
      domain: domain.domain,
      requestKey: `session-mode:${access.session}`,
      handler: SESSION_PERMISSION_MODE_HANDLER,
      protocol: '1',
      input: { tenant: tenant.value, session: access.session },
    })
    if (result.kind !== 'read') return { kind: 'unavailable' }
    const permission = decodeSessionPermissionMode(result.output)
    if (permission === 'malformed' || permission.kind !== 'current') return { kind: 'unavailable' }
    const publication = createSessionModesPublication({
      work,
      permission,
      defaults: await defaults(work),
    })
    return publication.kind === 'ready'
      ? { ...publication, scopes: work.contextScopes ?? [] }
      : { kind: 'unavailable' }
  }
  return Object.freeze({ read })
}

export type SessionModesSource<P> = ReturnType<typeof createSessionModesSource<P>>
