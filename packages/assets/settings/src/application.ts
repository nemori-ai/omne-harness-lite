import { z } from 'zod'
import { SettingsChangeSchema, SettingsTargetSchema, decideSettingsChange } from './commands.ts'
import { evaluateSettings, type SettingResolution } from './evaluation.ts'
import { SettingsIdSchema, type SettingItem, type SettingDefinitions } from './schema.ts'
import type {
  SettingsReadPort,
  SettingsCommitPort,
  SettingsFailure,
  SettingsBasis,
  SettingsTargetView,
  SettingsViewRequest,
} from './ports.ts'
import { immutable, withinSettingsBudget } from './value.ts'

const ViewRequestSchema = z.strictObject({
  deploymentRef: SettingsIdSchema,
  mode: z.enum(['management', 'runtime']),
  targets: z.array(SettingsTargetSchema).max(128),
  selectionRef: SettingsIdSchema.nullable(),
})
const CursorSchema = z.strictObject({
  scopeKey: z.string().min(1).max(2048),
  revision: z.string().min(1).max(2048),
  query: z.string().max(65536),
  offset: z.number().int().nonnegative().max(131072),
})
const CatalogRequestSchema = z.strictObject({
  view: ViewRequestSchema,
  filter: z.string().max(256),
  locale: z.string().min(1).max(64),
  pageSize: z.number().int().min(1).max(100),
  cursor: CursorSchema.nullable(),
})
export type SettingsCatalogRequest = z.infer<typeof CatalogRequestSchema>
export type SettingsCatalogEntry = Readonly<{
  target: SettingsTargetView['target']
  targetEnabled: boolean
  definitionRef: SettingsTargetView['definitionRef']
  revision: number
  item: SettingItem
  resolution: SettingResolution
  grants: SettingsTargetView['grants']
}>
export type SettingsCatalogPage = Readonly<{
  kind: 'catalog'
  basis: Readonly<{ scopeKey: string; revision: string }>
  groups: readonly Readonly<{
    definitionRef: SettingsTargetView['definitionRef']
    groups: SettingDefinitions['groups']
  }>[]
  entries: readonly SettingsCatalogEntry[]
  completeness: 'complete' | 'partial'
  unavailableProviders: readonly string[]
  nextCursor: z.infer<typeof CursorSchema> | null
}>
const invalid: SettingsFailure = Object.freeze({ kind: 'rejected', reason: 'invalid_input' })
const unavailable: SettingsFailure = Object.freeze({ kind: 'rejected', reason: 'unavailable' })

function requestIsSelectable(request: SettingsViewRequest): boolean {
  return request.mode === 'management' || request.selectionRef !== null
}
function targetKey(view: SettingsTargetView): string {
  return JSON.stringify([
    view.target.scopeRef,
    view.target.policyId,
    view.target.targetRef,
    view.definitionRef.providerId,
    view.definitionRef.definitionId,
  ])
}
function entriesOf(basis: SettingsBasis): readonly SettingsCatalogEntry[] | SettingsFailure {
  const entries: SettingsCatalogEntry[] = []
  const keys = new Set<string>()
  for (const view of basis.views) {
    const key = targetKey(view)
    if (keys.has(key)) return unavailable
    keys.add(key)
    const result = evaluateSettings({ definition: view.definition, sources: view.state.sources })
    if (result.kind !== 'complete')
      return {
        kind: 'rejected',
        reason: result.kind === 'unavailable' ? 'unavailable' : 'incompatible',
      }
    for (const item of view.definition.items) {
      const resolution = result.entries.find(entry => entry.itemId === item.id)!
      entries.push({
        target: view.target,
        targetEnabled: view.enabled,
        definitionRef: view.definitionRef,
        revision: view.state.revision,
        item,
        resolution,
        grants: view.grants,
      })
    }
  }
  entries.sort((a, b) => {
    const left = JSON.stringify([
      a.target.scopeRef,
      a.target.policyId,
      a.target.targetRef,
      a.definitionRef.providerId,
      a.definitionRef.definitionId,
      a.item.id,
    ])
    const right = JSON.stringify([
      b.target.scopeRef,
      b.target.policyId,
      b.target.targetRef,
      b.definitionRef.providerId,
      b.definitionRef.definitionId,
      b.item.id,
    ])
    return left < right ? -1 : left > right ? 1 : 0
  })
  return entries
}

export function createSettingsQueries<Context>(port: SettingsReadPort<Context>) {
  async function readBasis(
    context: Context,
    input: unknown,
  ): Promise<SettingsBasis | SettingsFailure> {
    if (!withinSettingsBudget(input)) return { kind: 'rejected', reason: 'limit_exceeded' }
    const parsed = ViewRequestSchema.safeParse(input)
    if (!parsed.success || !requestIsSelectable(parsed.data)) return invalid
    try {
      return await port.read(context, parsed.data)
    } catch {
      return unavailable
    }
  }
  return Object.freeze({
    async evaluate(context: Context, request: unknown) {
      const basis = await readBasis(context, request)
      if ('kind' in basis) return basis
      if (basis.completeness !== 'complete') return unavailable
      const entries = entriesOf(basis)
      if ('kind' in entries) return entries
      return immutable({
        kind: 'complete' as const,
        basis: { scopeKey: basis.scopeKey, revision: basis.revision },
        entries: structuredClone(entries),
      })
    },
    async readCatalog(
      context: Context,
      request: unknown,
    ): Promise<SettingsCatalogPage | SettingsFailure> {
      if (!withinSettingsBudget(request)) return { kind: 'rejected', reason: 'limit_exceeded' }
      const parsed = CatalogRequestSchema.safeParse(request)
      if (!parsed.success) return invalid
      const input = parsed.data
      const basis = await readBasis(context, input.view)
      if ('kind' in basis) return basis
      const query = JSON.stringify([input.view, input.filter, input.locale, input.pageSize])
      if (
        input.cursor &&
        (input.cursor.scopeKey !== basis.scopeKey ||
          input.cursor.revision !== basis.revision ||
          input.cursor.query !== query)
      )
        return { kind: 'rejected', reason: 'basis_changed' }
      const all = entriesOf(basis)
      if ('kind' in all) return all
      const matches = all.filter(entry =>
        `${entry.item.id} ${entry.item.presentation.title} ${entry.item.presentation.description}`.includes(
          input.filter,
        ),
      )
      const offset = input.cursor?.offset ?? 0
      if (offset > matches.length) return invalid
      const next = offset + input.pageSize
      return immutable(
        structuredClone({
          kind: 'catalog',
          basis: { scopeKey: basis.scopeKey, revision: basis.revision },
          groups: basis.views.map(view => ({
            definitionRef: view.definitionRef,
            groups: view.definition.groups,
          })),
          entries: matches.slice(offset, next),
          completeness: basis.completeness,
          unavailableProviders: basis.unavailableProviders,
          nextCursor:
            next < matches.length
              ? { scopeKey: basis.scopeKey, revision: basis.revision, query, offset: next }
              : null,
        }),
      )
    },
    async previewChange(context: Context, request: unknown) {
      if (!withinSettingsBudget(request))
        return { kind: 'rejected' as const, reason: 'limit_exceeded' as const }
      const schema = z.strictObject({ view: ViewRequestSchema, command: SettingsChangeSchema })
      const parsed = schema.safeParse(request)
      if (!parsed.success) return invalid
      const basis = await readBasis(context, parsed.data.view)
      if ('kind' in basis) return basis
      if (basis.completeness !== 'complete') return unavailable
      const command = parsed.data.command
      const view = basis.views.find(
        view =>
          view.target.policyId === command.target.policyId &&
          view.target.targetRef === command.target.targetRef &&
          view.target.scopeRef === command.target.scopeRef,
      )
      if (!view) return { kind: 'rejected' as const, reason: 'forbidden' as const }
      return decideSettingsChange({
        command,
        definition: view.definition,
        definitionRef: view.definitionRef,
        state: view.state,
        grants: view.grants,
      })
    },
  })
}

export function createSettingsCommands<Context>(port: SettingsCommitPort<Context>) {
  return Object.freeze({
    async change(context: Context, input: unknown) {
      if (!withinSettingsBudget(input))
        return { kind: 'rejected' as const, reason: 'limit_exceeded' as const }
      const parsed = SettingsChangeSchema.safeParse(input)
      if (!parsed.success) return invalid
      try {
        return await port.commit(context, parsed.data)
      } catch {
        return { kind: 'unknown' as const, operationId: parsed.data.operationId }
      }
    },
    async getOperation(context: Context, input: unknown) {
      const parsed = z
        .strictObject({ target: SettingsTargetSchema, operationId: SettingsIdSchema })
        .safeParse(input)
      if (!parsed.success) return invalid
      try {
        return await port.getOperation(context, parsed.data)
      } catch {
        return unavailable
      }
    },
    async readChanges(context: Context, input: unknown) {
      const parsed = z
        .strictObject({
          target: SettingsTargetSchema,
          afterRevision: z.number().int().nonnegative(),
          limit: z.number().int().min(1).max(100),
        })
        .safeParse(input)
      if (!parsed.success) return invalid
      try {
        return await port.readChanges(context, parsed.data)
      } catch {
        return unavailable
      }
    },
  })
}
