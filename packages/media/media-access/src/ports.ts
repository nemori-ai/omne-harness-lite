import type { LoginIdentity, Principal } from '@omne-harness/access-cordis-contract'
import type { Media } from '@omne-harness/media-contract'

/** Whether this login may act for a tenant now. The application answers it from identity. */
export interface TargetTenantPrincipals {
  actingFor(
    login: LoginIdentity,
    tenant: string,
  ): Promise<{ readonly ok: Principal } | { readonly refused: 'denied' | 'basis-unavailable' }>
}

/** What this plugin calls of the media face: taken at each call, absent while media is not loaded. */
export type MediaFace = Readonly<{
  uploads: Pick<Media['uploads'], 'begin' | 'append' | 'commit' | 'status'>
  custody: Pick<Media['custody'], 'describe'>
  reads: Media['reads']
  representations: Pick<Media['representations'], 'read' | 'ensure' | 'watch'>
}>
