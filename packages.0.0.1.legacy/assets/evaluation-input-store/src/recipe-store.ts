import {
  parseTenantId,
  type TenantId,
  type MembershipStanding,
} from '@omne-harness-lite/identity-values'
import { validate as messageValidate } from '@omne-harness-lite/messages'
import { narrow, type StorageUnit, type ReadTx } from '@omne-harness-lite/storage'
import {
  getAssetJudge,
  json,
  object,
  equal,
  parsed,
  text,
  inputFromSnapshot,
  readSourceSnapshot,
  type Recipe,
} from './data.ts'
import type { EvaluationStorageDependencies, SessionRecipeInput, SourceDb } from './types.ts'

function validRecipeShape(value: unknown): value is Record<string, unknown> {
  return (
    object(value) &&
    Object.keys(value).every(key =>
      ['session', 'tenant', 'rootDefinition', 'sessionAssignments', 'workspace'].includes(key),
    ) &&
    typeof value.session === 'string' &&
    messageValidate('SessionRef', value.session).valid &&
    'ok' in getAssetJudge().judgeAssetValue('CapabilityId', value.rootDefinition) &&
    object(value.rootDefinition) &&
    value.rootDefinition.category === 'agent_definition'
  )
}
function validWorkspace(value: Record<string, unknown>, tenant: TenantId): boolean {
  return (
    !Object.hasOwn(value, 'workspace') ||
    ('ok' in getAssetJudge().judgeAssetValue('WorkspaceKey', value.workspace) &&
      object(value.workspace) &&
      equal(value.workspace.tenant, tenant))
  )
}
export function sessionRecipe(
  value: unknown,
): { input: SessionRecipeInput; tenant: TenantId } | undefined {
  const copied = json(value)
  if (!validRecipeShape(copied)) return undefined
  const tenant = parseTenantId(copied.tenant)
  if (
    !('ok' in tenant) ||
    (Object.hasOwn(copied, 'sessionAssignments') && !Array.isArray(copied.sessionAssignments))
  )
    return undefined
  if (!validWorkspace(copied, tenant.ok)) return undefined
  return { input: copied as unknown as SessionRecipeInput, tenant: tenant.ok }
}
export function captureRecipeIn(
  unit: StorageUnit,
  deps: EvaluationStorageDependencies,
  input: SessionRecipeInput,
  tenant: TenantId,
  standing: MembershipStanding,
) {
  unit.assertStorage(deps.storage)
  return unit.run(() =>
    unit.mutate(async tx => {
      await tx.lockSentinel(`evaluation-recipe:${deps.storeKey}:${input.session}`)
      const db = narrow<SourceDb>(tx)
      const old = await db
        .selectFrom('evaluation_input_recipe')
        .selectAll()
        .where('store_key', '=', deps.storeKey)
        .where('session', '=', input.session)
        .executeTakeFirst()
      if (old !== undefined) {
        const assignments =
          old.session_assignments === null
            ? undefined
            : parsed(old.session_assignments, 'recipe_assignments')
        return equal(parsed(old.tenant, 'recipe_tenant'), tenant) &&
          equal(parsed(old.root_definition, 'recipe_root'), input.rootDefinition) &&
          old.workspace === null &&
          (assignments === undefined
            ? input.sessionAssignments === undefined
            : equal(assignments, input.sessionAssignments))
          ? ({ captured: true } as const)
          : ({ failure: 'conflict' } as const)
      }
      const recipe: Recipe = {
        tenant: tenant,
        standing,
        rootDefinition: input.rootDefinition,
        ...(input.sessionAssignments === undefined ? {} : { session: input.sessionAssignments }),
      }
      const source = inputFromSnapshot(await readSourceSnapshot(tx as ReadTx, deps, recipe), deps)
      await db
        .insertInto('evaluation_input_recipe')
        .values({
          store_key: deps.storeKey,
          session: input.session,
          tenant: text(tenant),
          standing_at_creation: text(standing),
          root_definition: text(input.rootDefinition),
          session_assignments:
            input.sessionAssignments === undefined ? null : text(input.sessionAssignments),
          workspace: null,
          source_at_creation: text({
            revision: source.revision,
            source: source.input.root.source,
          }),
        })
        .execute()
      return { captured: true } as const
    }),
  )
}
