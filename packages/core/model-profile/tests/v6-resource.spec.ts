import { assertAdoptedSchemaBytes } from './schema-identity.ts'
import { readFileSync } from 'node:fs'
import { Ajv2020 } from 'ajv/dist/2020.js'
import { describe, expect, it } from 'vitest'
import schema5 from '@omne-harness-lite/model-profile/schema' with { type: 'json' }
import schema6 from '@omne-harness-lite/model-profile/schema/v6' with { type: 'json' }
import identity from '@omne-harness-lite/identity-values/schema' with { type: 'json' }
import expiry from '@omne-harness-lite/offer-expiry/schema/v1' with { type: 'json' }
import content from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }
import {
  LosslessNumber,
  readJsonStrict,
  writeJsonLossless,
} from '@omne-harness-lite/content-blocks'
import {
  judgeModelProfileDocument,
  schemaId,
  validate,
  type ModelProfileSnapshot,
} from '@omne-harness-lite/model-profile'

const ajv = new Ajv2020({
  strict: true,
  strictTypes: false,
  strictRequired: false,
  validateFormats: false,
  ownProperties: true,
})
ajv.addKeyword('x-counterexamples')
for (const resource of [identity, expiry, content, schema5, schema6]) ajv.addSchema(resource)
const validators = [schema5, schema6].map(schema => {
  const validator = ajv.getSchema(`${schema.$id}#/$defs/ModelProfileSnapshot`)
  if (validator === undefined) throw new Error('missing exact snapshot resource')
  return validator
})

describe('MP6-R1..3 pure resource publication and MP5 value preservation', () => {
  it('keeps root MP5 and exact MP6 distinct with identical complete definitions', () => {
    expect(schemaId).toBe(schema5.$id)
    expect(schemaId).toContain('/model-profile/v5/')
    expect(schema6.$id).toContain('/model-profile/v6/')
    expect(schema5.$defs).toEqual(schema6.$defs)
    for (const [relative, version] of [
      ['../schema/model-profile.schema.json', 'v5'],
      ['../schema/v6/model-profile.schema.json', 'v6'],
    ] as const) {
      const bytes = readFileSync(new URL(relative, import.meta.url))
      assertAdoptedSchemaBytes(
        version === 'v5'
          ? '@omne-harness-lite/model-profile/schema'
          : '@omne-harness-lite/model-profile/schema/v6',
        bytes,
      )
    }
  })

  it.each(['v5', 'v6'])(
    'validates every %s normative snapshot at both precise definitions',
    version => {
      const source: unknown = JSON.parse(
        readFileSync(
          new URL(
            version === 'v5' ? 'fixtures/profile-examples.json' : 'fixtures/snapshot-examples.json',
            import.meta.url,
          ),
          'utf8',
        ),
      )
      if (
        source === null ||
        typeof source !== 'object' ||
        !('cases' in source) ||
        !Array.isArray(source.cases)
      )
        throw new Error('missing normative cases')
      let count = 0
      for (const row of source.cases) {
        if (
          row === null ||
          typeof row !== 'object' ||
          !('definition' in row) ||
          row.definition !== 'ModelProfileSnapshot'
        )
          continue
        if (!('value' in row) || !('schemaValid' in row) || typeof row.schemaValid !== 'boolean')
          throw new Error('malformed snapshot case')
        count++
        for (const validator of validators) expect(validator(row.value)).toBe(row.schemaValid)
      }
      expect(count).toBe(2)
    },
  )

  it('preserves complete MP5 caps, adaptation values and huge exact numbers through strict copy', () => {
    const huge = new LosslessNumber('900719925474099300000000000000000001')
    const snapshot: ModelProfileSnapshot = {
      providers: ['provider-a'],
      allowFallback: false,
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      maxInputTokens: huge,
      maxOutputTokens: 1024,
      inputConstraints: { maxImageBytes: huge, maxImages: 4, maxRequestBytes: huge },
      upstreamInputLimits: {
        maxInputTokens: { status: 'limited', value: huge },
        maxRequestBytes: { status: 'limited', value: huge },
        maxImageBytes: { status: 'limited', value: huge },
        maxImages: { status: 'unknown' },
      },
      adaptation: {
        implementation: { name: 'example-family', revision: 'r1' },
        definition: { modelId: 'vendor/chat', revision: 'd1' },
        configuration: {
          revision: 'c1',
          values: { nested: { exact: huge, enabled: true }, list: ['original', { cap: huge }] },
        },
      },
      parameters: { extra: { exact: huge } },
      updatedAt: '2026-09-29T00:00:00Z',
    }
    expect(
      judgeModelProfileDocument('ModelProfile', {
        ...snapshot,
        routeName: 'vendor/chat',
        origin: 'official',
        registration: 'listed',
      }),
    ).toEqual({ ok: true })
    expect(validate('ModelProfileSnapshot', snapshot)).toEqual({ valid: true })
    const bytes = writeJsonLossless(snapshot)
    const copy = readJsonStrict(bytes)
    if ('failed' in copy) throw new Error(copy.failed)
    expect(writeJsonLossless(copy.ok)).toBe(bytes)
    expect(validate('ModelProfileSnapshot', copy.ok)).toEqual({ valid: true })
    expect(writeJsonLossless(JSON.parse(bytes))).not.toBe(bytes)
    // This is the pure copy boundary; actual runtime freeze/created publication is a separate owner.
  })
})
