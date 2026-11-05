import { z } from 'zod'
import canonicalize from 'canonicalize'
import {
  SettingsDefinitionRefSchema,
  SettingsStateSchema,
  SettingsTargetSchema,
} from './commands.ts'
import { SettingsIdSchema, SettingDefinitionsSchema } from './schema.ts'
import { evaluateSettings } from './evaluation.ts'
import { immutable, withinSettingsBudget } from './value.ts'
import type { SettingsFailure } from './ports.ts'
export const SettingsRebaseSchema = z.strictObject({
  protocol: z.literal('settings-rebase/1'),
  requestId: SettingsIdSchema,
  operationId: SettingsIdSchema,
  target: SettingsTargetSchema,
  from: SettingsDefinitionRefSchema,
  to: SettingsDefinitionRefSchema,
  expectedRevision: SettingsStateSchema.shape.revision,
  assignments: z
    .array(
      z.strictObject({
        sourceId: SettingsIdSchema,
        itemId: SettingsIdSchema,
        disposition: z.enum(['retain', 'discard']),
      }),
    )
    .max(8192),
})
export type SettingsRebase = z.infer<typeof SettingsRebaseSchema>
const InputSchema = z.strictObject({
  command: SettingsRebaseSchema,
  state: SettingsStateSchema,
  previousDefinition: SettingsDefinitionRefSchema,
  nextDefinition: SettingsDefinitionRefSchema,
  definition: SettingDefinitionsSchema,
  sourceIds: z.array(SettingsIdSchema).min(1).max(32),
})
type RebaseInput = z.infer<typeof InputSchema>
type RebasePlan = {
  kind: 'ready'
  sources: RebaseInput['state']['sources']
  choices: Map<string, 'retain' | 'discard'>
  items: Set<string>
}

function fail(reason: SettingsFailure['reason']): SettingsFailure {
  return { kind: 'rejected', reason }
}

function assignmentKey(source: string, item: string): string {
  return JSON.stringify([source, item])
}

function prepareRebase(input: RebaseInput): RebasePlan | SettingsFailure {
  const { command, state, previousDefinition, nextDefinition, definition, sourceIds } = input
  if (command.expectedRevision !== state.revision) return fail('revision_conflict')
  if (
    canonicalize(command.from) !== canonicalize(previousDefinition) ||
    canonicalize(command.to) !== canonicalize(nextDefinition)
  )
    return fail('definition_changed')
  if (
    definition.providerId !== nextDefinition.providerId ||
    definition.definitionId !== nextDefinition.definitionId ||
    definition.version !== nextDefinition.version
  )
    return fail('definition_changed')
  if (new Set(sourceIds).size !== sourceIds.length) return fail('invalid_input')
  const choices = new Map(
    command.assignments.map(a => [assignmentKey(a.sourceId, a.itemId), a.disposition]),
  )
  if (choices.size !== command.assignments.length) return fail('invalid_input')
  const sources: RebasePlan['sources'] = sourceIds.map(id => ({ id, values: [] }))
  const items = new Set(definition.items.map(item => item.id))
  return { kind: 'ready', sources, choices, items }
}

function applyRebaseAssignments(
  state: RebaseInput['state'],
  { sources, choices, items }: RebasePlan,
): SettingsFailure | undefined {
  for (const old of state.sources)
    for (const value of old.values) {
      const entry = assignmentKey(old.id, value.itemId),
        disposition = choices.get(entry)
      if (!disposition) return fail('invalid_input')
      choices.delete(entry)
      if (disposition === 'discard') continue
      const target = sources.find(source => source.id === old.id)
      if (!target || !items.has(value.itemId)) return fail('incompatible')
      target.values.push(value)
    }
  if (choices.size) return fail('invalid_input')
  return undefined
}

function finishRebase(
  { state, previousDefinition, nextDefinition, definition }: RebaseInput,
  sources: RebasePlan['sources'],
): ReturnType<typeof decideSettingsRebase> {
  if (evaluateSettings({ definition, sources }).kind !== 'complete') return fail('incompatible')
  const changed =
    canonicalize(previousDefinition) !== canonicalize(nextDefinition) ||
    canonicalize(state.sources) !== canonicalize(sources)
  if (changed && state.revision >= Number.MAX_SAFE_INTEGER - 1) return fail('limit_exceeded')
  return immutable({
    kind: changed ? 'changed' : 'no_change',
    state: { revision: state.revision + (changed ? 1 : 0), sources },
  })
}

export function decideSettingsRebase(
  raw: unknown,
):
  | Readonly<{ kind: 'changed' | 'no_change'; state: z.infer<typeof SettingsStateSchema> }>
  | SettingsFailure {
  if (!withinSettingsBudget(raw)) return fail('limit_exceeded')
  const parsed = InputSchema.safeParse(raw)
  if (!parsed.success) return fail('invalid_input')
  const plan = prepareRebase(parsed.data)
  if (plan.kind === 'rejected') return plan
  const failure = applyRebaseAssignments(parsed.data.state, plan)
  if (failure) return failure
  return finishRebase(parsed.data, plan.sources)
}
