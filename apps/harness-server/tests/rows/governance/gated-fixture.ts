import type { Context } from '@deepseek-ai/cordis'
import { heldPoint, type BodyContract } from '@omne-harness/assets'
import { assetCategoriesKey } from '@omne-harness/assets-cordis-contract'
import type { JsonValue } from '@omne-harness/json-text'
import {
  gatedCategoryContract,
  type CategoryGateTemplate,
} from '../../../src/entry/category-gates.ts'
import { defineRow } from '../../../src/row.ts'
import type { AddedRow } from '../../support/release-tree.ts'

/** A category that exists only in tests and has one gate; the assembly names its template. */
export const PROBE = 'probe'
export const PROBE_TEMPLATE: CategoryGateTemplate = {
  category: PROBE,
  ownerId: 'test.probe-gates',
  gates: [{ id: 'invoke', title: '调用', default: 'ask' }],
}

const text = (value: string): JsonValue => ({ kind: 'string', value })
export const probeBody = (endpoint: string): JsonValue => ({
  kind: 'object',
  entries: [{ key: 'endpoint', value: text(endpoint) }],
})

const schema: JsonValue = {
  kind: 'object',
  entries: [
    { key: 'type', value: text('object') },
    {
      key: 'properties',
      value: {
        kind: 'object',
        entries: [
          {
            key: 'endpoint',
            value: { kind: 'object', entries: [{ key: 'type', value: text('string') }] },
          },
        ],
      },
    },
  ],
}

const contract: BodyContract = {
  category: PROBE,
  schema,
  judge: body => {
    const value = body as JsonValue
    return value.kind === 'object' && value.entries.some(entry => entry.key === 'endpoint')
      ? { ok: true }
      : { ok: false, rejected: 'endpoint' }
  },
  deriveDeclarations: () => ({ entries: [] }),
  references: () => [],
}

const probeRow = defineRow({
  row: 'gated-fixture',
  implementation: 'real',
  manifest: { provides: [], injects: [assetCategoriesKey], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'gated-fixture',
    inject: [assetCategoriesKey],
    apply(ctx: Context) {
      ctx.assetCategories.contribute(
        {
          contract: gatedCategoryContract(contract, PROBE_TEMPLATE),
          display: {
            title: '探针',
            summary: '只在测试里、带一道关口的类别。',
            creation: '填一个地址。',
          },
        },
        heldPoint({ name: 'test.probe', key: 'the item name', summary: 'Held probes.' }),
      )
    },
  },
})

export const PROBE_ROW: AddedRow = {
  id: 'gated-fixture',
  plugin: 'probeRow',
  config: {},
  definition: probeRow,
}
