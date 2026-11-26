import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { Adoption } from '@omne-harness/session-contract'
import type { NeedBinding, StatefulBlockDescriptor } from '@omne-harness/runtime-context-contract'

export const WORKSPACE_GUIDANCE_PROVENANCE = '@omne-harness/session-adapters/workspace-guidance'
const text = z.string().min(1)
const source = z.strictObject({
  path: text,
  digest: text,
  text: z.string(),
})
export const workspaceGuidanceScopeSchema = z.strictObject({
  workspace: text,
  instance: text,
  root: text,
})
export type WorkspaceGuidanceScope = z.infer<typeof workspaceGuidanceScopeSchema>
export const workspaceGuidanceManifestSchema = z.strictObject({
  key: z.literal('session.workspace-guidance'),
  scope: workspaceGuidanceScopeSchema.nullable(),
  sources: z.array(source.pick({ path: true, digest: true })),
})
export const workspaceGuidanceBodySchema = z.strictObject({
  key: z.literal('session.workspace-guidance'),
  scope: workspaceGuidanceScopeSchema,
  source,
})
export const workspaceGuidanceSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('inactive') }),
  z.strictObject({
    state: z.literal('unavailable'),
    workspace: text,
    instance: text,
    root: text,
    path: text,
    reason: z.enum(['denied', 'unreadable', 'unknown']),
    diagnostic: text,
  }),
  z.strictObject({
    state: z.literal('attached'),
    workspace: text,
    instance: text,
    root: text,
    sources: z.array(source),
    absent: z.array(text).optional(),
  }),
])
export type WorkspaceGuidance = z.infer<typeof workspaceGuidanceSchema>

declare module '@omne-harness/runtime-context-contract' {
  interface ContextBlocks {
    'session.workspace-guidance': WorkspaceGuidance
  }
}

const key = 'session.workspace-guidance'
export const SESSION_WORKSPACE_GUIDANCE: Adoption = Object.freeze({
  owner: '@omne-harness/session-adapters',
  name: key,
  revision: '1',
  digest:
    'sha256:' +
    createHash('sha256')
      .update(JSON.stringify(z.toJSONSchema(workspaceGuidanceSchema)))
      .digest('hex'),
})

export const workspaceGuidanceDescriptor = Object.freeze({
  key,
  schema: workspaceGuidanceSchema,
  consumers: ['model'] as const,
  required: true,
  disclosure: 'eligibility-checked',
  carriesPrevious: false,
  volatility: 'per-step',
  kind: 'stateful',
  writers: ['coordinator'] as const,
  reduce: (_current: unknown, update: unknown) => workspaceGuidanceSchema.parse(update),
  persistence: 'checkpointed',
  singleWriterPerStep: true,
} satisfies StatefulBlockDescriptor<typeof key, WorkspaceGuidance>)

export const workspaceGuidanceBindings = [
  {
    key,
    need: {
      name: 'session.workspace-guidance-for-model',
      shape: workspaceGuidanceSchema,
      consumer: 'model',
      purpose: 'Read directory instructions from the selected workspace',
      necessity: 'required',
    },
  },
] as const satisfies readonly NeedBinding<typeof key, WorkspaceGuidance>[]
