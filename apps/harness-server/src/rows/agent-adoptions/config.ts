import { z } from 'zod'

const text = z.string().min(1)
const adoption = z.strictObject({ owner: text, name: text, revision: text, digest: text })
const evidence = z.strictObject({ owner: text, record: text, revision: text, digest: text })

const modes = z.strictObject({
  permission: z.enum(['never', 'auto_permission', 'bypass-permissions']),
  environment: adoption,
  collaboration: z.enum(['co-work', 'auto-drive']),
})

const entry = z.strictObject({
  name: text,
  candidate: adoption,
  execution: adoption,
  entryContract: adoption,
  requiredIdentities: z.array(z.strictObject({ capability: text, name: text })),
  modes,
  initialModelSelection: z.strictObject({ name: text, basis: evidence }).optional(),
  definition: z.record(z.string(), z.unknown()),
  extensions: z.array(z.unknown()).default([]),
})

/** How a definition that a tenant holds or a workspace carries runs: what an entry gives besides its definition. */
const custom = entry.pick({
  execution: true,
  entryContract: true,
  requiredIdentities: true,
  modes: true,
  initialModelSelection: true,
})

export const agentAdoptionsConfig = z
  .strictObject({ mappings: z.array(entry).min(1), custom: custom.optional() })
  .superRefine((config, issues) => {
    const names = new Set<string>()
    const candidates = new Set<string>()
    config.mappings.forEach((item, index) => {
      if (names.has(item.name))
        issues.addIssue({
          code: 'custom',
          path: ['mappings', index, 'name'],
          message: 'duplicate definition name',
        })
      names.add(item.name)
      const key = JSON.stringify([
        item.candidate.owner,
        item.candidate.name,
        item.candidate.revision,
        item.candidate.digest,
      ])
      if (candidates.has(key))
        issues.addIssue({
          code: 'custom',
          path: ['mappings', index, 'candidate'],
          message: 'duplicate definition candidate',
        })
      candidates.add(key)
    })
  })

export type AgentAdoptionsConfig = z.output<typeof agentAdoptionsConfig>
export type CustomDefaults = z.output<typeof custom>
