import type { Context } from '@deepseek-ai/cordis'
import { createAgentActionQualification } from '@omne-harness/agent'
import {
  agentAdoptionsKey,
  agentJournalKey,
  agentJournalEntriesKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import { releaseToolRequestsOf } from '../../entry/tool-requests.ts'
import type { PermissionOrigins } from './permission-basis-read.ts'

const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    owner: 'harness.permission-origin',
    diagnostic: 'The original Agent source is not assembled.',
  })

export function permissionOriginsOf(ctx: Context): PermissionOrigins {
  return {
    action: {
      async qualify(input) {
        const journal = ctx.get(agentJournalKey)
        const entries = ctx.get(agentJournalEntriesKey)
        const materials = ctx.get(agentMaterialsKey)
        if (!journal || !entries || !materials) return unavailable()
        return createAgentActionQualification({
          journal,
          entries,
          materials,
          toolRequests: releaseToolRequestsOf(ctx),
        }).qualify(input)
      },
    },
    adoptions: {
      async resolve(input) {
        return ctx.get(agentAdoptionsKey)?.resolve(input) ?? unavailable()
      },
    },
  }
}
