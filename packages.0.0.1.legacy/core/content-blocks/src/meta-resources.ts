import metaSchema from 'ajv/dist/refs/json-schema-2020-12/schema.json' with { type: 'json' }
import applicatorMeta from 'ajv/dist/refs/json-schema-2020-12/meta/applicator.json' with { type: 'json' }
import unevaluatedMeta from 'ajv/dist/refs/json-schema-2020-12/meta/unevaluated.json' with { type: 'json' }
import contentMeta from 'ajv/dist/refs/json-schema-2020-12/meta/content.json' with { type: 'json' }
import coreMeta from 'ajv/dist/refs/json-schema-2020-12/meta/core.json' with { type: 'json' }
import formatMeta from 'ajv/dist/refs/json-schema-2020-12/meta/format-annotation.json' with { type: 'json' }
import metadataMeta from 'ajv/dist/refs/json-schema-2020-12/meta/meta-data.json' with { type: 'json' }
import validationMeta from 'ajv/dist/refs/json-schema-2020-12/meta/validation.json' with { type: 'json' }
import { readJsonStrict, writeJsonLossless } from './json.ts'

// Only fixed dialect inputs live at module scope. Pin their own lossless copies;
// another consumer of Ajv's mutable JSON imports cannot change this authority.
export const fixedMetaResources = Object.freeze(
  [
    metaSchema,
    applicatorMeta,
    unevaluatedMeta,
    contentMeta,
    coreMeta,
    formatMeta,
    metadataMeta,
    validationMeta,
  ].map(resource => {
    const parsed = readJsonStrict(writeJsonLossless(resource))
    if ('failed' in parsed) throw new Error('standard meta-Schema is not JSON')
    return parsed.ok
  }),
)
export const fixedMetaId = metaSchema.$id
