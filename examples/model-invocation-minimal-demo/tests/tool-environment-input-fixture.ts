import { join } from 'node:path'
import { capabilityCanonicalString, type AssetDefinition } from '@omne-harness-lite/asset-model'
import { toOpaqueJson, copyJsonValue } from '@omne-harness-lite/content-blocks'
import {
  createEvaluationInputReader,
  evaluationInputMigrations,
  type InputSourceDependencies,
} from '@omne-harness-lite/evaluation-input-store'
import {
  publishLocalInputs,
  captureSessionRecipe,
} from '@omne-harness-lite/evaluation-input-store/publication'
import { composeMigrations } from '@omne-harness-lite/storage'
import { openStorage } from '@omne-harness-lite/storage-sql'
import type { SessionTenancyService } from '@omne-harness-lite/session-tenancy'
import type { EnvironmentPermission } from '@omne-harness-lite/execution-environments'
import { at, scope, type FixtureTool } from './tool-driver-history-fixture.ts'

/** SQL publication, recipe and current reader are real; standing and session ownership are controlled. */
export async function toolEnvironmentInputs(
  directory: string,
  tool: FixtureTool,
  sessionTenancy: Pick<SessionTenancyService, 'holdingTenant'>,
) {
  const storage = await openStorage({
    dialect: 'sqlite',
    file: join(directory, 'environment-inputs.sqlite'),
    upgrade: false,
    migrations: composeMigrations(evaluationInputMigrations),
  })
  const root = { category: 'agent_definition', name: 'environment-fixture:root' } as const,
    capability = { category: 'tool', name: tool.name } as const
  if (capabilityCanonicalString(capability) !== tool.capability)
    throw new Error('Environment fixture requires a canonical tool capability')
  const captured = copyJsonValue(tool.definition)
  if ('failed' in captured) throw new Error('Environment fixture requires a JSON definition')
  const definitions: readonly AssetDefinition[] = [
    {
      id: 'environment-root',
      capability: root,
      origin: 'official',
      versions: [
        {
          number: 1,
          publishedAt: at,
          content: {
            category: 'agent_definition',
            body: toOpaqueJson({ references: [{ capability }], attributes: [] }),
          },
        },
      ],
    },
    {
      id: tool.asset,
      capability,
      origin: 'official',
      versions: [
        {
          number: 1,
          publishedAt: at,
          content: { category: 'tool', definition: captured.ok },
        },
      ],
    },
  ]
  const unused = async (): Promise<never> => {
    throw new Error('Unused membership operation')
  }
  const deps: InputSourceDependencies = {
    storage,
    storeKey: 'environment-fixture',
    deployedOfficial: [root, capability].map(capability => ({ capability, meta: false })),
    sessionTenancy,
    memberships: {
      participate: () => ({
        standing: async () => ({ standing: 'effective', role: 'member' }),
        mine: unused,
        changeRole: unused,
        remove: unused,
        currentTenant: unused,
        switchCurrentTenant: unused,
        list: unused,
      }),
    },
    diagnostics() {},
    onDiagnosticFailure() {},
    monotonicNow: process.hrtime.bigint,
  }
  const published = await publishLocalInputs(deps, {
    expectedRevision: null,
    definitions,
    scopes: [
      {
        holder: { layer: 'factory' },
        holdings: definitions.map(value => ({
          holder: { layer: 'factory' },
          capability: value.capability,
          asset: value.id,
          basis: { kind: 'official' },
          versionSelection: { kind: 'current' },
          immutable: false,
          assignments: [],
          since: at,
        })),
      },
      { holder: { layer: 'organization', organization: scope.tenant.organization }, holdings: [] },
      { holder: { layer: 'tenant', tenant: scope.tenant }, holdings: [] },
    ],
  })
  if (!('revision' in published)) throw new Error(`Environment publication: ${published.failure}`)
  let revision = published.revision
  const recipe = await captureSessionRecipe(deps, {
    ...scope,
    rootDefinition: root,
  })
  if (!('captured' in recipe)) throw new Error(`Environment recipe: ${recipe.failure}`)
  const reader = createEvaluationInputReader(deps)
  return {
    reader,
    async permission(permission: EnvironmentPermission) {
      const result = await publishLocalInputs(deps, {
        expectedRevision: revision,
        definitions: [],
        scopes: [
          {
            holder: { layer: 'tenant', tenant: scope.tenant },
            holdings: [
              {
                holder: { layer: 'tenant', tenant: scope.tenant },
                capability,
                asset: tool.asset,
                basis: { kind: 'official' },
                versionSelection: { kind: 'current' },
                immutable: false,
                assignments: [
                  {
                    item: 'executionEnvironment',
                    value: { allowed: [permission] },
                    immutable: false,
                    since: at,
                  },
                ],
                since: at,
              },
            ],
          },
        ],
      })
      if (!('revision' in result)) throw new Error(`Environment permission: ${result.failure}`)
      revision = result.revision
    },
    async close() {
      await reader.close()
      await storage.close()
    },
  }
}
