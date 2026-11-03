import { writeJsonText } from '@omne-harness/json-text'
import {
  environmentNeedAdoption,
  environmentNeedSchema,
  type EnvironmentNeedDeclaration,
} from '@omne-harness/execution-environment-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonicalDigest } from '@omne-harness/tool'
import type { Reply, ToolDefinition } from '@omne-harness/tool-contract'

/** Uses the contract-owned synchronous validator, as accepted for the built-in layer in R2-D79. */
export function createEnvironmentSchemaCheck() {
  return {
    resource: '@omne-harness/execution-environment-contract#environmentNeedSchema',
    digest: environmentNeedAdoption.digest,
    async check(definition: ToolDefinition): Reply<EnvironmentNeedDeclaration> {
      const declaration = definition.declarations.environment
      if (
        !declaration ||
        canonicalDigest(declaration.adoption) !== canonicalDigest(environmentNeedAdoption)
      )
        return fail({
          kind: 'invalid',
          field: 'environment.adoption',
          reason: 'unknown environment declaration adoption',
        })
      try {
        const input: unknown = JSON.parse(writeJsonText(declaration.value))
        const checked = environmentNeedSchema['~standard'].validate(input)
        if (checked instanceof Promise) {
          void checked.catch(() => undefined)
          return fail({
            kind: 'unavailable',
            dependency: 'environment-need-schema',
            diagnostic: 'The contract validator must be synchronous.',
          })
        }
        if (checked.issues !== undefined && checked.issues.length > 0)
          return fail({
            kind: 'invalid',
            field: 'environment',
            reason: 'invalid environment need declaration',
          })
        if (checked.issues === undefined && 'value' in checked) return succeed(checked.value)
      } catch {
        return fail({
          kind: 'unavailable',
          dependency: 'environment-need-schema',
          diagnostic: 'The contract validator or JSON projection failed.',
        })
      }
      return fail({
        kind: 'unavailable',
        dependency: 'environment-need-schema',
        diagnostic: 'The contract validator gave no explicit value.',
      })
    },
  }
}
