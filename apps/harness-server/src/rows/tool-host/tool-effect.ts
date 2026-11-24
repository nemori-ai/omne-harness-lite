import type { Context } from '@deepseek-ai/cordis'
import { judgePackageContent, type CategoryEffect } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import { toolToolsPoint } from '@omne-harness/tool-cordis-contract/cordis'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  scriptToolImpact,
  scriptToolPlace,
  type ScriptToolLoad,
} from '@omne-harness/tool-contract/provider'
import { registrantOf } from '../../entry/tool-release.ts'
import { heldStandingOf, rejectionText } from '../tenant-assets/held-standing.ts'
import { currentHeldTool } from './held-current.ts'
import { TOOL_CATEGORY } from './held-tools.ts'

const POINT = toolToolsPoint.name
const NOT_A_DIRECTORY = 'a tool made here is published from a directory'

/** Whether the version a tenant holds could be loaded: asked by loading it, as a call would. */
async function loadOf(ctx: Context, tenantRef: string, name: string): Promise<ScriptToolLoad> {
  const tenant = tenantCodec.parse(tenantRef)
  const registrant = registrantOf(ctx)
  if (!tenant.ok || registrant === undefined) return 'unknown'
  const access = { principal: registrant.principal, tenant: tenant.value }
  const current = await currentHeldTool(ctx, access, name, null)
  if (current.kind === 'held') return 'callable'
  return current.kind === 'unfit' ? { failed: current.reason } : 'unknown'
}

/** What the tool category tells of its own: what publishing a directory would do, and whether a held one can be called. */
export function toolEffectOf(ctx: Context, deployed: (name: string) => boolean): CategoryEffect {
  return {
    impact: {
      async of({ capability, change, content }) {
        const { name } = capability
        if (change !== 'publish') {
          const going = change !== 'enable'
          const says = going ? '→ Tools no longer finds it' : '→ Tools finds it and calls it again'
          const line = { mark: going ? '-' : '+', of: null, point: POINT, key: name, says } as const
          return { kind: 'changes', lines: [line], loads: null, advice: null }
        }
        const contract = ctx.get(assetCategoriesKey)?.view.lookup(TOOL_CATEGORY)
        if (contract === undefined)
          return { kind: 'unavailable', reason: 'the tool category is not there now' }
        const judged =
          deployed(name) || content === undefined
            ? undefined
            : content.kind === 'directory'
              ? await judgePackageContent(contract, content.from, name)
              : { failure: { kind: 'invalid-package' as const, reason: NOT_A_DIRECTORY } }
        const refused =
          judged !== undefined && 'failure' in judged ? rejectionText(judged.failure) : null
        const told = scriptToolImpact(POINT, { name, deployed: deployed(name), refused })
        return { kind: 'changes', ...told, loads: null }
      },
    },
    placement: {
      async of({ tenant, capability }) {
        const { name } = capability
        const held = heldStandingOf(ctx, capability, tenant)
        const place = deployed(name)
          ? { point: POINT, key: name, standing: 'selected', says: 'installed with the deployment' }
          : scriptToolPlace(
              POINT,
              name,
              held?.standing,
              held?.standing.kind === 'selected' ? await loadOf(ctx, tenant, name) : 'unknown',
            )
        return { kind: 'placed', places: [place], clients: null, advice: null }
      },
    },
  }
}
