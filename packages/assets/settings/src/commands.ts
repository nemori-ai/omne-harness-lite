import canonicalize from 'canonicalize'
import { z } from 'zod'
import { evaluateSettings, type SettingsEvaluationResult } from './evaluation.ts'
import {
  SettingsIdSchema,
  SettingsReferenceSchema,
  SettingsEvaluationSchema,
  SettingSourceSchema,
  type SettingSource,
} from './schema.ts'
import { immutable, withinSettingsBudget } from './value.ts'

export const SettingsTargetSchema = z.strictObject({
  policyId: SettingsIdSchema,
  targetRef: SettingsReferenceSchema,
  scopeRef: SettingsReferenceSchema,
})
export const SettingsDefinitionRefSchema = z.strictObject({
  providerId: SettingsIdSchema,
  definitionId: SettingsIdSchema,
  version: SettingsIdSchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
})
export const SettingsActionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('set'), value: z.json() }),
  z.strictObject({ kind: z.literal('clear') }),
  z.strictObject({ kind: z.literal('lock') }),
  z.strictObject({ kind: z.literal('unlock') }),
])
export const SettingsChangeSchema = z.strictObject({
  protocol: z.literal('settings/1'),
  requestId: SettingsIdSchema,
  operationId: SettingsIdSchema,
  target: SettingsTargetSchema,
  definitionRef: SettingsDefinitionRefSchema,
  expectedRevision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  sourceId: SettingsIdSchema,
  itemId: SettingsIdSchema,
  action: SettingsActionSchema,
})
export type SettingsTarget = z.infer<typeof SettingsTargetSchema>
export type SettingsDefinitionRef = z.infer<typeof SettingsDefinitionRefSchema>
export type SettingsChange = z.infer<typeof SettingsChangeSchema>
export const SettingsStateSchema = z.strictObject({
  revision: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER - 1),
  sources: z.array(SettingSourceSchema).max(32),
})
export type SettingsState = z.infer<typeof SettingsStateSchema>
const DecisionInputSchema = z.strictObject({
  command: SettingsChangeSchema,
  state: SettingsStateSchema,
  definition: SettingsEvaluationSchema.shape.definition,
  definitionRef: SettingsDefinitionRefSchema,
  grants: z
    .array(
      z.strictObject({
        sourceId: SettingsIdSchema,
        actions: z
          .array(SettingsActionSchema.options[0].shape.kind.or(z.enum(['clear', 'lock', 'unlock'])))
          .max(4),
      }),
    )
    .max(32),
})
export type SettingsChangeDecision =
  | Readonly<{
      kind: 'changed' | 'no_change'
      state: SettingsState
      evaluation: Extract<SettingsEvaluationResult, { kind: 'complete' }>
    }>
  | Readonly<{
      kind: 'rejected'
      reason:
        | 'invalid_input'
        | 'limit_exceeded'
        | 'revision_conflict'
        | 'definition_changed'
        | 'forbidden'
        | 'locked'
        | 'incompatible'
    }>

type DecisionInput = z.infer<typeof DecisionInputSchema>

function currentDefinition({ command, definitionRef, definition }: DecisionInput): boolean {
  const left = command.definitionRef
  const right = definitionRef
  return (
    left.providerId === right.providerId &&
    left.definitionId === right.definitionId &&
    left.version === right.version &&
    left.digest === right.digest &&
    definition.providerId === right.providerId &&
    definition.definitionId === right.definitionId &&
    definition.version === right.version
  )
}
function changeSource(source: SettingSource, command: SettingsChange): SettingSource {
  const existing = source.values.find(value => value.itemId === command.itemId)
  const current = existing ?? {
    itemId: command.itemId,
    value: { kind: 'absent' as const },
    locked: false,
  }
  const action = command.action
  const next =
    action.kind === 'set'
      ? { ...current, value: { kind: 'value' as const, value: action.value } }
      : action.kind === 'clear'
        ? { ...current, value: { kind: 'absent' as const } }
        : { ...current, locked: action.kind === 'lock' }
  const values = source.values.filter(value => value.itemId !== command.itemId)
  if (next.value.kind !== 'absent' || next.locked) values.push(next)
  values.sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId === b.itemId ? 0 : 1))
  return { id: source.id, values }
}

function authorizeChange(
  input: DecisionInput,
):
  | Readonly<{ kind: 'authorized'; position: number }>
  | Extract<SettingsChangeDecision, { kind: 'rejected' }> {
  const { command, state, definition, grants } = input
  if (command.expectedRevision !== state.revision)
    return { kind: 'rejected', reason: 'revision_conflict' }
  if (!currentDefinition(input)) return { kind: 'rejected', reason: 'definition_changed' }
  const grant = grants.find(grant => grant.sourceId === command.sourceId)
  const position = state.sources.findIndex(source => source.id === command.sourceId)
  if (!grant?.actions.includes(command.action.kind) || position < 0)
    return { kind: 'rejected', reason: 'forbidden' }
  if (!definition.items.some(item => item.id === command.itemId))
    return { kind: 'rejected', reason: 'incompatible' }
  if (
    state.sources
      .slice(0, position)
      .some(source => source.values.some(value => value.itemId === command.itemId && value.locked))
  )
    return { kind: 'rejected', reason: 'locked' }
  return { kind: 'authorized', position }
}

/** A decision over already qualified facts. The commit provider must recheck these facts atomically. */
export function decideSettingsChange(input: unknown): SettingsChangeDecision {
  if (!withinSettingsBudget(input)) return { kind: 'rejected', reason: 'limit_exceeded' }
  const parsed = DecisionInputSchema.safeParse(input)
  if (!parsed.success) return { kind: 'rejected', reason: 'invalid_input' }
  const authorized = authorizeChange(parsed.data)
  if (authorized.kind === 'rejected') return authorized
  const { command, state, definition } = parsed.data
  const { position } = authorized
  const sources = state.sources.map((source, index) =>
    index === position ? changeSource(source, command) : source,
  )
  const evaluation = evaluateSettings({ definition, sources })
  if (evaluation.kind !== 'complete') return { kind: 'rejected', reason: 'incompatible' }
  const before = state.sources[position]!
  const after = sources[position]!
  const old = before.values.find(value => value.itemId === command.itemId)
  const next = after.values.find(value => value.itemId === command.itemId)
  const changed = canonicalize(old ?? null) !== canonicalize(next ?? null)
  if (changed && state.revision >= Number.MAX_SAFE_INTEGER - 1)
    return { kind: 'rejected', reason: 'limit_exceeded' }
  return immutable({
    kind: changed ? 'changed' : 'no_change',
    state: { revision: state.revision + (changed ? 1 : 0), sources },
    evaluation,
  })
}
