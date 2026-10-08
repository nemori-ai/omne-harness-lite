import { assertContentSchemaTransition } from '../../content-blocks/tests/schema-transition.ts'
import { assertLoopSchemaTransition } from '../../loop-extension/tests/schema-transition.ts'
import { assertMessagesSchemaTransition } from '../../messages/tests/schema-transition.ts'
import { assertResponseSchemaTransition } from './schema-transition.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCHEMA_DEF_NAMES, validate } from '@omne-harness-lite/model-response'
import schema from '@omne-harness-lite/model-response/schema' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import { membersValid, pendingMembersValid, normativeSchemaResources } from '../src/schema.ts'

const paths = [
  'identity-values/schema',
  'offer-expiry/schema/v1',
  'content-blocks/schema',
  'content-blocks/schema/v2',
  'call-accounts/schema',
  'model-profile/schema',
  'messages/schema',
  'loop-extension/schema',
  'model-response/schema',
]
const { allOf: responseConditions, ...responseMembers } = schema.$defs.ModelResponse
const { allOf: pendingConditions, ...pendingMembers } = schema.$defs.PendingModelResponse
const { dependentRequired: failureCondition, ...failureMembers } = schema.$defs.Failure
const memberId = `${schema.$id}?stage=members`
const memberSchema = {
  ...schema,
  $id: memberId,
  $defs: {
    ...schema.$defs,
    ModelResponse: responseMembers,
    PendingModelResponse: pendingMembers,
    Failure: failureMembers,
  },
}
function compileRoots(resources: typeof normativeSchemaResources) {
  const runtime = createSchemaRuntime([...resources, memberSchema])
  for (const name of SCHEMA_DEF_NAMES) runtime.compile({ $ref: `${schema.$id}#/$defs/${name}` })
  for (const name of ['ModelResponse', 'PendingModelResponse'])
    runtime.compile({ $ref: `${memberId}#/$defs/${name}` })
}

describe('RC1–RC5 / MR11 exact public and private resource closure', () => {
  it('initializes all 25 public definitions and both actual private member entries', () => {
    expect(normativeSchemaResources).toHaveLength(9)
    expect(new Set(normativeSchemaResources.map(resource => resource.$id)).size).toBe(9)
    expect(SCHEMA_DEF_NAMES).toHaveLength(25)
    expect(SCHEMA_DEF_NAMES).toEqual(Object.keys(schema.$defs))
    expect(() => compileRoots(normativeSchemaResources)).not.toThrow()
    for (const name of SCHEMA_DEF_NAMES) expect(validate(name, undefined).valid).toBe(false)
    expect(membersValid(null)).toBe(false)
    expect(pendingMembersValid(null)).toBe(false)
  })
  for (const [index, resource] of normativeSchemaResources.entries()) {
    it(`uses exact public bytes for ${resource.$id}`, () => {
      const specifier = paths[index]
      if (specifier === undefined) throw new Error('public resource path required')
      const bytes = readFileSync(new URL(import.meta.resolve(`@omne-harness-lite/${specifier}`)))
      const relative = new URL(resource.$id).pathname.split('/spec/data/')[1]
      if (relative === undefined) throw new Error('canonical resource id required')
      const canonical = readFileSync(
        new URL(
          `../../../../.meta_harness/design/spec/data/${specifier === 'messages/schema' ? relative.replace('/v9/', '/v8/') : specifier === 'model-response/schema' ? relative.replace('/v12/', '/v11/') : relative}`,
          import.meta.url,
        ),
      )
      if (specifier === 'content-blocks/schema') assertContentSchemaTransition(bytes, canonical)
      else if (specifier === 'loop-extension/schema') assertLoopSchemaTransition(bytes, canonical)
      else if (specifier === 'messages/schema') assertMessagesSchemaTransition(bytes, canonical)
      else if (specifier === 'model-response/schema')
        assertResponseSchemaTransition(bytes, canonical)
      else {
        expect(bytes.equals(canonical)).toBe(true)
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(
          createHash('sha256').update(canonical).digest('hex'),
        )
      }
    })
    it(`removing ${resource.$id} fails with that exact missing URI`, () => {
      let failure: unknown
      try {
        compileRoots(normativeSchemaResources.filter((_, selected) => selected !== index))
      } catch (error) {
        failure = error
      }
      expect(failure).toMatchObject({ missingSchema: resource.$id })
    })
  }
})
