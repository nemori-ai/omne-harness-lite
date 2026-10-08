import { assertContentSchemaTransition } from '../../content-blocks/tests/schema-transition.ts'
import { assertToolSchemaTransition } from '../../tool-definition/tests/schema-transition.ts'
import { assertMessagesSchemaTransition } from './schema-transition.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SCHEMA_DEF_NAMES, validate } from '@omne-harness-lite/messages'
import schema from '@omne-harness-lite/messages/schema' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import accountsSchema from '@omne-harness-lite/call-accounts/schema' with { type: 'json' }
import profileSchema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import profileV6Schema from '@omne-harness-lite/model-profile/schema/v6' with { type: 'json' }
import toolsSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'

const resources = [
  identitySchema,
  expirySchema,
  contentSchema,
  retainedContentSchema,
  accountsSchema,
  profileSchema,
  profileV6Schema,
  toolsSchema,
  schema,
]
const publicPaths = [
  'identity-values/schema',
  'offer-expiry/schema/v1',
  'content-blocks/schema',
  'content-blocks/schema/v2',
  'call-accounts/schema',
  'model-profile/schema',
  'model-profile/schema/v6',
  'tool-definition/schema',
  'messages/schema',
]
const completeRuntime = createSchemaRuntime(resources)
describe('M8-V1 exact public-definition resource closure', () => {
  it('compiles all 53 definitions with MP5 and MP6 both present', () => {
    expect(resources).toHaveLength(9)
    expect(new Set(resources.map(resource => resource.$id)).size).toBe(9)
    expect(SCHEMA_DEF_NAMES).toHaveLength(53)
    expect(new Set(SCHEMA_DEF_NAMES)).toEqual(new Set(Object.keys(schema.$defs)))
    const runtime = completeRuntime
    for (const name of SCHEMA_DEF_NAMES) {
      expect(() => runtime.compile({ $ref: `${schema.$id}#/$defs/${name}` })).not.toThrow()
      expect(validate(name, undefined).valid).toBe(false)
    }
    expect(profileSchema.$id).toContain('/v5/')
    expect(profileV6Schema.$id).toContain('/v6/')
  })
  for (const [index, resource] of resources.entries()) {
    it(`exact public resource ${resource.$id}`, () => {
      const publicPath = publicPaths[index]
      if (publicPath === undefined) throw new Error('public resource path required')
      const bytes = readFileSync(new URL(import.meta.resolve(`@omne-harness-lite/${publicPath}`)))
      const relative = new URL(resource.$id).pathname.split('/spec/data/')[1]
      if (relative === undefined) throw new Error('canonical resource id required')
      const canonical = readFileSync(
        new URL(
          `../../../../.meta_harness/design/spec/data/${publicPath === 'messages/schema' ? relative.replace('/v9/', '/v8/') : relative}`,
          import.meta.url,
        ),
      )
      if (publicPath === 'content-blocks/schema') assertContentSchemaTransition(bytes, canonical)
      else if (publicPath === 'tool-definition/schema') assertToolSchemaTransition(bytes, canonical)
      else if (publicPath === 'messages/schema') assertMessagesSchemaTransition(bytes, canonical)
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
        const runtime = createSchemaRuntime(resources.filter((_, selected) => selected !== index))
        for (const name of SCHEMA_DEF_NAMES)
          runtime.compile({ $ref: `${schema.$id}#/$defs/${name}` })
      } catch (error) {
        failure = error
      }
      expect(failure).toMatchObject({ missingSchema: resource.$id })
    })
  }
})
