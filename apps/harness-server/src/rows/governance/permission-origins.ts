import type { Context } from '@deepseek-ai/cordis'
import { createAgentActionQualification, createAgentToolQualification } from '@omne-harness/agent'
import {
  agentAdoptionsKey,
  agentJournalKey,
  agentJournalEntriesKey,
  agentMaterialsKey,
  agentToolReceptionTargetsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import { fail } from '@omne-harness/operation-result'
import { releaseToolRequestsOf } from '../../entry/tool-requests.ts'
import { toolInvocationQualificationKey } from '../tool-runtime/source-qualification.ts'
import type { PermissionOrigins } from './permission-read-options.ts'

const unavailable = () =>
  fail({
    kind: 'unavailable' as const,
    owner: 'harness.permission-origin',
    diagnostic: 'The original Agent source is not assembled.',
  })

/** Each owner is read only for the branch that needs it; no runtime startup dependency. */
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
    tool: {
      async qualify(input) {
        const original = ctx.get(toolInvocationQualificationKey)
        return original === undefined
          ? fail({
              kind: 'unavailable',
              dependency: 'tool-records',
              diagnostic: 'The original Tool source is not assembled.',
            })
          : original.qualify(input)
      },
    },
    toolAgent: {
      async qualify(input) {
        const journal = ctx.get(agentJournalKey)
        const materials = ctx.get(agentMaterialsKey)
        const targets = ctx.get(agentToolReceptionTargetsKey)
        if (!journal || !materials || !targets) return unavailable()
        return createAgentToolQualification({ journal, materials, targets }).qualify(input)
      },
    },
    adoptions: {
      async resolve(input) {
        return ctx.get(agentAdoptionsKey)?.resolve(input) ?? unavailable()
      },
    },
  }
}
