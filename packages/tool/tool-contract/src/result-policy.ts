// The named default result policy (G3, P14): its identity and its judgment.
import {
  judgeContentBlock,
  type ContentBlock,
  type ContentBlockKind,
  type ReferenceContentBlock,
  type TextContentBlock,
} from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import { describedAdoption } from './adoption.ts'
import type { ResultPolicy } from './execution.ts'
import { decodeToolBodyId, type Adoption } from './identity.ts'
import { decodeToolMaterialInstant } from './materials.ts'
import { jsonValue } from './json-tree.ts'
import type { ToolMessageContentBlock, ToolResult, ToolRenderedResult } from './results.ts'
import {
  decimal,
  identity,
  refine,
  describeRejection,
  isPlainObject,
  judgeAt,
  list,
  literal,
  record,
  reject,
  slot,
  variant,
  type Check,
} from './shape.ts'
import { adoption, contentReference, schemaIdentity } from './value-shapes.ts'

/**
 * The rule set of the default result policy. The policy accepts only text blocks and shared
 * reference blocks (`ToolMessageContentBlock`). It rejects thinking blocks, inline media, inline
 * files, nested containers and unknown kinds. A change to these rules needs a new revision.
 */
export const defaultResultPolicyRules = Object.freeze({
  owner: '@omne-harness/tool-contract',
  name: 'default-result-policy',
  revision: '1',
  accept: Object.freeze(['text', 'voice-reference', 'image-reference', 'file-reference'] as const),
  reject: Object.freeze([
    'thinking',
    'inline-media',
    'inline-file',
    'nested-container',
    'unknown-kind',
  ] as const),
})

/**
 * The adoption of the default result policy. `digest` is `sha256:` and the hexadecimal SHA-256
 * of the JSON text of `defaultResultPolicyRules`, so a reader can recompute it.
 */
export const defaultResultPolicyAdoption: Adoption = describedAdoption(defaultResultPolicyRules)

type PolicyRule =
  | (typeof defaultResultPolicyRules.accept)[number]
  | (typeof defaultResultPolicyRules.reject)[number]

/** The rule of each content block kind, written inline and written as a shared reference. */
const BLOCK_RULES: Readonly<
  Record<ContentBlockKind, Readonly<{ inline: PolicyRule; reference: PolicyRule }>>
> = {
  text: { inline: 'text', reference: 'unknown-kind' },
  thinking: { inline: 'thinking', reference: 'unknown-kind' },
  voice: { inline: 'inline-media', reference: 'voice-reference' },
  image: { inline: 'inline-media', reference: 'image-reference' },
  file: { inline: 'inline-file', reference: 'file-reference' },
}

/** A value holds other content when it is a message tool part or carries a block list. */
const CONTAINER_KINDS: readonly string[] = ['tool_call', 'tool_result']
const CONTAINER_KEYS: readonly string[] = ['blocks', 'content']
const ACCEPTED: ReadonlySet<PolicyRule> = new Set(defaultResultPolicyRules.accept)

function isBlockKind(kind: string): kind is ContentBlockKind {
  return Object.hasOwn(BLOCK_RULES, kind)
}

function ruleOf(value: unknown): PolicyRule {
  if (!isPlainObject(value)) return 'unknown-kind'
  if (CONTAINER_KEYS.some(key => Object.hasOwn(value, key))) return 'nested-container'
  const kind = slot(value, 'kind')
  if (kind.kind !== 'value' || typeof kind.value !== 'string') return 'unknown-kind'
  if (CONTAINER_KINDS.includes(kind.value)) return 'nested-container'
  if (!isBlockKind(kind.value)) return 'unknown-kind'
  const rules = BLOCK_RULES[kind.value]
  return Object.hasOwn(value, 'ref') ? rules.reference : rules.inline
}

function messageBlock(block: ContentBlock): ToolMessageContentBlock | undefined {
  if (block.kind === 'text') return messageText(block)
  return 'ref' in block ? messageReference(block) : undefined
}

function messageText(block: TextContentBlock): TextContentBlock {
  return Object.freeze({ ...block, visibility: Object.freeze({ ...block.visibility }) })
}

function messageReference(block: ReferenceContentBlock): ReferenceContentBlock {
  return Object.freeze({
    ...block,
    visibility: Object.freeze({ ...block.visibility }),
    ref: Object.freeze({ ...block.ref }),
  })
}

/**
 * Judges one block. A rejected kind returns its rule name from `defaultResultPolicyRules.reject`.
 * An accepted kind with a broken shape returns `invalid-` and the content-block rejection.
 */
function judgeBlock(
  value: unknown,
): Outcome<ToolMessageContentBlock, Readonly<{ reason: string }>> {
  const rule = ruleOf(value)
  if (!ACCEPTED.has(rule)) return fail({ reason: rule })
  const judged = judgeContentBlock(value)
  if ('rejected' in judged) return fail({ reason: `invalid-${judged.rejected}` })
  const block = messageBlock(judged.ok)
  return block === undefined ? fail({ reason: 'unknown-kind' }) : succeed(block)
}

const block: Check<ToolMessageContentBlock> = (value, at) => {
  const judged = judgeBlock(value)
  return 'ok' in judged ? judged : reject(at, judged.failure.reason)
}

const resultData = variant('kind', {
  none: record({ kind: literal('none') }),
  json: record({
    kind: literal('json'),
    contract: adoption,
    schema: schemaIdentity,
    value: jsonValue,
  }),
})
const bodyRepresentation = variant('kind', {
  text: record({ kind: literal('text'), codec: adoption }),
  'json-document': record({
    kind: literal('json-document'),
    codec: adoption,
    schema: schemaIdentity,
  }),
  'json-lines': record({
    kind: literal('json-lines'),
    codec: adoption,
    recordSchema: schemaIdentity,
  }),
})
const bodyRetention = refine(
  record({
    adoption,
    activatedAt: identity(decodeToolMaterialInstant),
    expiresAt: identity(decodeToolMaterialInstant),
  }),
  (value, at) =>
    Date.parse(value.expiresAt) > Date.parse(value.activatedAt)
      ? undefined
      : { field: at, reason: 'positive-retention' },
)
function committedResultShape<B extends ContentBlock>(
  checkedBlock: Check<B>,
): Check<ToolResult<B>> {
  return record({
    content: list(checkedBlock),
    data: resultData,
    attachments: list(contentReference),
    original: variant('kind', {
      none: record({ kind: literal('none') }),
      offloaded: record({
        kind: literal('offloaded'),
        source: contentReference,
        summary: list(checkedBlock),
        bodyId: identity(decodeToolBodyId),
        representation: bodyRepresentation,
        bodyBytes: decimal,
        previewKind: literal('author-summary', 'mechanical'),
        retention: bodyRetention,
      }),
    }),
  })
}
export const toolResultShape = committedResultShape(block)
export const toolRenderedResultShape: Check<ToolRenderedResult<ToolMessageContentBlock>> = record({
  content: list(block),
  data: resultData,
  attachments: list(contentReference),
  original: variant('kind', {
    none: record({ kind: literal('none') }),
    offloaded: record({
      kind: literal('offloaded'),
      source: contentReference,
      summary: list(block),
    }),
  }),
})
export function judgeCommittedToolResult<B extends ContentBlock>(
  policy: ResultPolicy<B>,
  value: unknown,
): Outcome<ToolResult<B>, Readonly<{ reason: string }>> {
  const checkedBlock: Check<B> = (candidate, at) => {
    const known = judgeContentBlock(candidate)
    if ('rejected' in known) return reject(at, known.rejected)
    const judged = policy.judge(known.ok)
    return 'failure' in judged ? reject(at, judged.failure.reason) : judged
  }
  const checked = judgeAt(committedResultShape(checkedBlock), value, 'result')
  if ('failure' in checked) return fail({ reason: describeRejection(checked.failure) })
  const original = checked.ok.original
  const rendered: ToolRenderedResult<B> = {
    ...checked.ok,
    original:
      original.kind === 'none'
        ? original
        : {
            kind: 'offloaded',
            source: original.source,
            summary: original.summary,
          },
  }
  const admitted = policy.judgeResult(rendered)
  return 'failure' in admitted ? admitted : checked
}

/**
 * The named default result policy (G3). `judge` admits one block; `judgeResult` admits a whole
 * result, including the summary of an offloaded original. Rejections name the rule or the path.
 */
export const defaultResultPolicy: ResultPolicy<ToolMessageContentBlock> = Object.freeze({
  adoption: defaultResultPolicyAdoption,
  judge: judgeBlock,
  judgeResult(value: ToolRenderedResult<ContentBlock>) {
    const checked = judgeAt(toolRenderedResultShape, value, 'result')
    return 'ok' in checked ? checked : fail({ reason: describeRejection(checked.failure) })
  },
})
