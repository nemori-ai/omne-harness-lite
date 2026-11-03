import { readFile } from 'node:fs/promises'
import {
  createSchemaProvider,
  defineSchema,
  jsonSchemaDefinition,
  validate,
  close,
} from '@omne-harness/schema-provider'
import {
  environmentNeedAdoption,
  environmentNeedSchema,
  type EnvironmentNeedDeclaration,
} from '@omne-harness/execution-environment-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { Reply, ToolDefinition } from '@omne-harness/tool-contract'
import { sha256 } from './helpers.ts'

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
export async function createEnvironmentSchemaCheck() {
  const resource = new URL(
    '../../../../execution/execution-environment-contract/schema/environment-need.schema.json',
    import.meta.url,
  )
  const bytes = await readFile(resource)
  const digest = `sha256:${sha256(bytes)}`
  if (digest !== environmentNeedAdoption.digest)
    throw new Error('The contract-owned environment schema does not match its adopted byte digest')
  const document: unknown = JSON.parse(bytes.toString('utf8'))
  if (!record(document))
    throw new Error('The contract-owned environment schema is not a JSON object')
  const provider = createSchemaProvider({
    maxSnapshots: 4,
    maxConstructDepth: 32,
    maxConstructNodes: 4096,
    failureBackoffMs: 0,
    maxAttempts: 1,
  })
  const reference = defineSchema<EnvironmentNeedDeclaration>({
    id: 'windows-e2/environment-need',
    load: async () => jsonSchemaDefinition({ document, numbers: 'exact-or-reject' }),
  })
  return {
    resource: resource.href,
    digest,
    async check(definition: ToolDefinition): Reply<EnvironmentNeedDeclaration> {
      const declaration = definition.declarations.environment
      if (
        !declaration ||
        canonicalDigest(declaration.adoption) !== canonicalDigest(environmentNeedAdoption)
      )
        return fail({
          kind: 'invalid',
          field: 'environment.adoption',
          reason: 'the actual builtin must adopt the frozen environment schema',
        })
      const checked = await validate(provider, reference, { kind: 'ok', value: declaration.value })
      if (checked.kind !== 'valid')
        return fail({
          kind: 'unavailable',
          dependency: 'environment-need-schema',
          diagnostic: `Schema provider answered ${checked.kind}`,
        })
      const standard = await environmentNeedSchema['~standard'].validate(checked.value)
      return standard.issues
        ? fail({
            kind: 'invalid',
            field: 'environment',
            reason: 'the Standard Schema disagrees with its contract resource',
          })
        : succeed(standard.value)
    },
    close() {
      close(provider)
    },
  }
}
