import { z } from 'zod'
import { canvasAppKind, tenantIdSchema, type TenantId } from '@omne-harness/canvas-contract'
import { canvasKey, putKind } from '@omne-harness/canvas-cordis-contract/cordis'
import { canvasPersistenceParticipant, canvasPolicySchema } from '@omne-harness/canvas-local'
import { createCanvasLocalPlugin } from '@omne-harness/canvas-local/cordis'
import { dynamisKey } from '@omne-harness/dynamis-cordis/cordis'
import {
  combinationManifest,
  manifestDigest,
  type SqlStorage,
  type TenantDomainLookup,
} from '@omne-harness/sql-contract'
import { storageKey, tenantDomainLookupKey } from '@omne-harness/sql-contract/cordis'
import { defineRow } from '../../row.ts'
import {
  tenantDomainRegistrationKey,
  type TenantDomainRegistration,
} from '../governance/tenant-domain-registration-service.ts'
import { productionStorageCatalog } from '../storage/production-catalog.ts'
import { createDomainBindings, type Combination } from '../storage/tenant-bindings.ts'
import { liveCallOrigin } from '../tool-bindings/live-calls.ts'
import { createCanvasAuthority } from './authority.ts'
import { canvasMovers } from './movers.ts'

export const canvasConfig = z.strictObject({ policy: canvasPolicySchema })
const PARTICIPANTS = [canvasPersistenceParticipant]

/** The storage combination of the canvas participant, from the catalogue of the running code. */
export async function canvasCombination(): Promise<Combination> {
  const catalog = await productionStorageCatalog()
  const manifest = combinationManifest({ catalog, participants: PARTICIPANTS })
  if (manifest.kind !== 'manifest') throw new Error('canvas combination is not registrable')
  const digest = manifestDigest(manifest.manifest)
  return { combinationVersion: `harness-canvas/${digest.slice(0, 16)}`, manifestDigest: digest }
}

export const canvasRow = defineRow({
  row: 'canvas',
  implementation: 'real',
  manifest: {
    provides: [canvasKey],
    injects: [storageKey, dynamisKey, tenantDomainLookupKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'body', phase: 'composition' },
  Config: canvasConfig,
  async body(ctx, raw) {
    const { policy } = canvasConfig.parse(raw)
    const logger = ctx.logger('canvas')
    const bindings = createDomainBindings<TenantId>(
      {
        storage: ctx.get(storageKey) as SqlStorage,
        lookup: ctx.get(tenantDomainLookupKey) as TenantDomainLookup,
        registration: () =>
          ctx.get(tenantDomainRegistrationKey) as TenantDomainRegistration | undefined,
        combination: canvasCombination,
        // The canvas has no work of its own to look for in every tenant, so it never lists them.
        listing: async () => ({ kind: 'unavailable', diagnostic: 'the canvas lists no tenants' }),
        report: (tenant, reason) =>
          logger.warn('no canvas storage for tenant %s: %s', tenant, reason),
      },
      PARTICIPANTS,
      text => tenantIdSchema.parse(text),
    )
    const provider = ctx.plugin(createCanvasLocalPlugin(), {
      policy,
      sql: bindings,
      ports: { authority: createCanvasAuthority(), movers: canvasMovers(liveCallOrigin(ctx)) },
    })
    await provider.await()
    // The canvas's own kind goes on canvas.kinds like anyone else's, without admit.
    ctx.inject([dynamisKey], child => {
      putKind(child, canvasAppKind)
    })
    return {
      async stop() {
        await provider.dispose()
        return { kind: 'settled' }
      },
    }
  },
})
