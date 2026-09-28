import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import agentSchema from '@omne-harness-lite/agent-definition/schema' with { type: 'json' }
import assetSchema from '@omne-harness-lite/asset-model/schema' with { type: 'json' }
import contentSchema from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import retainedContentSchema from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import { createSchemaRuntime } from '@omne-harness-lite/content-blocks/schema-runtime'
import identitySchema from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import currentProfileSchema from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import pinnedProfileSchema from '@omne-harness-lite/model-profile/schema/v3' with { type: 'json' }
import expirySchema from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import toolSchema from '@omne-harness-lite/tool-definition/schema' with { type: 'json' }
import { judgeAgentDefinitionBody } from '../src/index.ts'

const acceptedProfileId =
  'https://omne-harness-lite.invalid/meta-harness/omne-harness-lite-design-2026-09-15/spec/data/model-profile/v3/model-profile.schema.json'
const bodyRef = `${agentSchema.$id}#/$defs/AgentDefinitionBody`
const fixedResources = [
  agentSchema,
  assetSchema,
  toolSchema,
  contentSchema,
  retainedContentSchema,
  identitySchema,
  expirySchema,
]

test('AD1 resolves its exact frozen MP3 resource through the public package export', () => {
  const exportedBytes = readFileSync(
    new URL(import.meta.resolve('@omne-harness-lite/model-profile/schema/v3')),
  )
  const frozenBytes = readFileSync(
    new URL(
      '../../../../.meta_harness/design/spec/data/model-profile/v3/model-profile.schema.json',
      import.meta.url,
    ),
  )
  expect(exportedBytes).toEqual(frozenBytes)
  expect(createHash('sha256').update(exportedBytes).digest('hex')).toBe(
    'fe5ef98ebd0902d0353dbc2ea8885d0bba24eff18912d8db9f8e9d6291790b8d',
  )
  expect(pinnedProfileSchema.$id).toBe(acceptedProfileId)
  expect(currentProfileSchema.$id).not.toBe(acceptedProfileId)

  const validator = createSchemaRuntime([...fixedResources, pinnedProfileSchema]).compile({
    $ref: bodyRef,
  })
  expect(validator.validate({ references: [], attributes: [] })).toBe(true)
  expect(judgeAgentDefinitionBody({ references: [], attributes: [] })).toEqual({ ok: true })
  expect(judgeAgentDefinitionBody({ references: [], attributes: null })).toEqual({
    rejected: 'malformed',
  })
})

test('removing pinned MP3 fails initialization even when current MP5 is present', () => {
  expect(() =>
    createSchemaRuntime([...fixedResources, currentProfileSchema]).compile({ $ref: bodyRef }),
  ).toThrow(/model-profile\/v3\/model-profile\.schema\.json/)
})
