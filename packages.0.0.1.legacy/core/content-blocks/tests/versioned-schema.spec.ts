import { assertContentSchemaTransition } from './schema-transition.ts'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import current from '@omne-harness-lite/content-blocks/schema' with { type: 'json' }
import retained from '@omne-harness-lite/content-blocks/schema/v2' with { type: 'json' }

it('D068 current default3 has only the adopted delta; retained2 stays byte-exact', () => {
  for (const [version, resource, suffix] of [
    [3, current, ''],
    [2, retained, '.v2'],
  ] as const) {
    const bytes = readFileSync(
      new URL(`../schema/content-blocks${suffix}.schema.json`, import.meta.url),
    )
    if (version === 3) {
      assertContentSchemaTransition(
        bytes,
        readFileSync(new URL('./fixtures/content-before-admission.schema.json', import.meta.url)),
      )
    } else {
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        'ed9c7d15f35edfd1b24cef510367449a3a8ed5eefd5305464709220304ee6b21',
      )
    }
    expect(resource.$id).toContain(`/v${version}/content-blocks.schema.json`)
    expect(Object.keys(resource.$defs).sort()).toEqual(
      [
        ...[
          'BlockId',
          'CallId',
          'ModelToolName',
          'Visibility',
          'MediaType',
          'Modality',
          'CapabilityId',
          'AttachmentRef',
          'InlineBytes',
          'DerivedRendering',
          'BlockBase',
          'TextBlock',
          'ThinkingBlock',
          'VoiceBlock',
          'ImageBlock',
          'FileBlock',
          'ToolCallBlock',
          'IncompleteToolCallBlock',
          'ExecutionOutcome',
          'PlaceholderReason',
          'ToolResultBlock',
          'ContentBlock',
        ],
        ...(version === 3 ? ['AdmissionDenialCode', 'ActionDenialReason', 'ToolCallOutcome'] : []),
      ].sort(),
    )
  }
})
