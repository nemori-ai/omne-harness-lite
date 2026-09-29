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
import accountsV2Schema from '@omne-harness-lite/call-accounts/schema/v2' with { type: 'json' }
import profileV6Schema from '@omne-harness-lite/model-profile/schema/v6' with { type: 'json' }
import profileV2Schema from '@omne-harness-lite/model-profile/schema/v2' with { type: 'json' }
import toolsSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import toolsV2Schema from '@omne-harness-lite/tool-definition/schema/v2' with { type: 'json' }
import assetsSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import assetsV2Schema from '@omne-harness-lite/asset-model/schema/v2' with { type: 'json' }
import loopV3Schema from '@omne-harness-lite/loop-extension/schema/v3' with { type: 'json' }
import loopV2Schema from '@omne-harness-lite/loop-extension/schema/v2' with { type: 'json' }
import messagesV3Schema from '@omne-harness-lite/messages/schema/v3' with { type: 'json' }
import messagesV2Schema from '@omne-harness-lite/messages/schema/v2' with { type: 'json' }
import skillsV2Schema from '@omne-harness-lite/skill-package/schema/v2' with { type: 'json' }
import mcpSchema from '@omne-harness-lite/mcp-endpoint/schema' with { type: 'json' }
import slashSchema from '@omne-harness-lite/slash-command/schema' with { type: 'json' }
import connectorV2Schema from '@omne-harness-lite/asset-model/schema/connector/v2' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'

const resources = [
  identitySchema,
  expirySchema,
  contentSchema,
  retainedContentSchema,
  accountsSchema,
  profileSchema,
  accountsV2Schema,
  profileV6Schema,
  profileV2Schema,
  toolsSchema,
  toolsV2Schema,
  assetsSchema,
  assetsV2Schema,
  loopV3Schema,
  loopV2Schema,
  messagesV3Schema,
  messagesV2Schema,
  skillsV2Schema,
  mcpSchema,
  slashSchema,
  connectorV2Schema,
  schema,
]
const publicPaths = [
  'identity-values/schema',
  'offer-expiry/schema/v1',
  'content-blocks/schema',
  'content-blocks/schema/v2',
  'call-accounts/schema',
  'model-profile/schema',
  'call-accounts/schema/v2',
  'model-profile/schema/v6',
  'model-profile/schema/v2',
  'tool-definition/schema',
  'tool-definition/schema/v2',
  'asset-model/schema',
  'asset-model/schema/v2',
  'loop-extension/schema/v3',
  'loop-extension/schema/v2',
  'messages/schema/v3',
  'messages/schema/v2',
  'skill-package/schema/v2',
  'mcp-endpoint/schema',
  'slash-command/schema',
  'asset-model/schema/connector/v2',
  'messages/schema',
]
const completeRuntime = createSchemaRuntime(resources)
describe('M7-V1 complete exact fixed 22-resource graph', () => {
  it('compiles all 50 definitions with MP5 and MP6 both present', () => {
    expect(resources).toHaveLength(22)
    expect(new Set(resources.map(resource => resource.$id)).size).toBe(22)
    expect(SCHEMA_DEF_NAMES).toHaveLength(50)
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
    it(`compiles every definition of ${resource.$id}`, () => {
      for (const name of Object.keys(resource.$defs))
        expect(() =>
          completeRuntime.compile({ $ref: `${resource.$id}#/$defs/${name}` }),
        ).not.toThrow()
    })
    it(`exact public resource ${resource.$id}`, () => {
      const publicPath = publicPaths[index]
      if (publicPath === undefined) throw new Error('public resource path required')
      const bytes = readFileSync(new URL(import.meta.resolve(`@omne-harness-lite/${publicPath}`)))
      const relative = new URL(resource.$id).pathname.split('/spec/data/')[1]
      if (relative === undefined) throw new Error('canonical resource id required')
      const canonical = readFileSync(
        new URL(`../../../../.meta_harness/design/spec/data/${relative}`, import.meta.url),
      )
      expect(bytes.equals(canonical)).toBe(true)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        createHash('sha256').update(canonical).digest('hex'),
      )
    })
    it(`removing ${resource.$id} prevents full initialization`, () => {
      expect(() => {
        const runtime = createSchemaRuntime(resources.filter((_, selected) => selected !== index))
        for (const source of resources.filter((_, selected) => selected !== index))
          for (const name of Object.keys(source.$defs))
            runtime.compile({ $ref: `${source.$id}#/$defs/${name}` })
        for (const name of SCHEMA_DEF_NAMES)
          runtime.compile({ $ref: `${schema.$id}#/$defs/${name}` })
      }).toThrow()
    })
  }
})
