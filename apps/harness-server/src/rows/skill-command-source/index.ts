import type { Context, Plugin } from '@deepseek-ai/cordis'
import { assetChangesKey } from '@omne-harness/assets-cordis-contract'
import type { AssetChanges } from '@omne-harness/assets-cordis-contract/cordis'
import { access as accessOf, tenantCodec } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionId } from '@omne-harness/session-contract'
import { sessionWorkPrincipalsKey } from '@omne-harness/session-cordis-contract/cordis'
import { createSkillEntrySource } from '@omne-harness/skill-command-source'
import { skillAccessKey, skillCatalogKey } from '@omne-harness/skill-cordis-contract/cordis'
import {
  commandEntrySourcesKey,
  type CommandEntrySourcesService,
} from '@omne-harness/slash-command-cordis-contract/cordis'
import { sessionWorkReaderOf } from '../../entry/tool-requests.ts'
import { defineRow } from '../../row.ts'
import { turnScopeOf } from '../tool-bindings/skills.ts'

const skillCommandSourcePlugin: Plugin.Object = {
  name: 'skill-command-source',
  inject: [commandEntrySourcesKey],
  apply(ctx: Context) {
    const readWork = sessionWorkReaderOf(ctx)
    const source = createSkillEntrySource<unknown, unknown>({
      catalog: () => ctx.get(skillCatalogKey),
      access: () => ctx.get(skillAccessKey),
      // The session's own work reads the catalogue, so the person sees what the agent of this session can read.
      async readerOf({ tenant, session }) {
        try {
          const work = await ctx
            .get(sessionWorkPrincipalsKey)
            ?.forSession({ actor: 'coordinator', tenant, session: session as SessionId })
          if (work === undefined || !('ok' in work)) return fail('unavailable')
          const read = await readWork({ principal: work.ok, tenant, session: session as SessionId })
          if (read === undefined || !('ok' in read)) return fail('unavailable')
          return succeed({ access: accessOf(work.ok, tenant), scope: turnScopeOf(read.ok) })
        } catch {
          return fail('unavailable')
        }
      },
      changes(tenant, changed) {
        const changes = ctx.get(assetChangesKey, false) as AssetChanges | undefined
        const text = tenantCodec.encode(tenant)
        if (changes === undefined || !text.ok) return () => {}
        return changes.subscribe(text.value, { changed, closed: changed })
      },
    })
    ;(ctx.get(commandEntrySourcesKey) as CommandEntrySourcesService<unknown>).contribute(source)
  },
}

/** The Skill catalogue as one command entry source: every Skill the session can read is a reference, with nothing kept. */
export const skillCommandSourceRow = defineRow({
  row: 'skill-command-source',
  implementation: 'real',
  manifest: {
    provides: [],
    injects: [commandEntrySourcesKey],
    sameProviderGroup: null,
  },
  lifecycle: { kind: 'none' },
  plugin: skillCommandSourcePlugin,
})
