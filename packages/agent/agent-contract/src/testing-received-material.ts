import { judgeContentBlock } from '@omne-harness/content-block'
import { judgeJsonValue } from '@omne-harness/json-text'
import { judgePart } from '@omne-harness/message'
import {
  decodeModelCallId,
  decodeModelOperationId,
  decodeOutputCursor,
  decodeResultVersion,
} from '@omne-harness/model-contract'
import { decodeToolCallId, decodeToolOperationId } from '@omne-harness/tool-contract'
import {
  decodeToolDeliveryId,
  decodeToolResultVersion,
  decodeToolWaitId,
} from '@omne-harness/tool-contract/provider'
import { z } from 'zod'

const text = z.string()
const identity = (decode: (value: string) => object) =>
  text.refine(value => 'ok' in decode(value), 'invalid identity')
const evidence = z.object({
  owner: text.min(1),
  record: text.min(1),
  revision: text.min(1),
  digest: text.min(1),
})
const adoption = z.object({
  owner: text.min(1),
  name: text.min(1),
  revision: text.min(1),
  digest: text.min(1),
})
const json = z.unknown().refine(value => 'ok' in judgeJsonValue(value), 'invalid JsonValue')
const block = z.unknown().refine(value => 'ok' in judgeContentBlock(value), 'invalid ContentBlock')
const modelBlock = z.unknown().refine(value => {
  const judged = judgePart(value)
  return (
    'ok' in judged &&
    !['tool_call_incomplete', 'tool_call_unparsed', 'tool_result'].includes(judged.ok.kind)
  )
}, 'invalid ModelBlock')
const reference = z
  .object({
    storage: text.min(1),
    key: text.min(1),
    mediaType: text,
    bytes: text.regex(/^(0|[1-9][0-9]*)$/),
    digest: text.min(1),
  })
  .strict()
const modelFault = z.intersection(
  z.object({ diagnostic: text, upstreamStatus: text.nullable() }),
  z.discriminatedUnion('cause', [
    z.object({
      cause: z.enum([
        'profile-withdrawn',
        'excluded',
        'modality',
        'credential',
        'input-rejected',
        'upstream-unavailable',
        'stream-lost',
        'runtime-lost',
        'persistence',
        'policy-unavailable',
        'upstream-protocol',
        'unclassified',
      ]),
      replayCarried: z.literal(true).optional(),
    }),
    z.object({ cause: z.literal('replay-rejected'), replayCarried: z.literal(true) }),
    z.object({
      cause: z.literal('input-over-limit'),
      reported: z.object({
        metric: z
          .enum([
            'context-tokens',
            'input-tokens',
            'image-bytes',
            'image-count',
            'request-bytes',
            'voice-bytes',
            'voice-duration-ms',
          ])
          .nullable(),
        limit: text.nullable(),
        actual: text.nullable(),
      }),
      replayCarried: z.literal(true).optional(),
    }),
  ]),
)
const modelPage = z.object({
  parts: z.array(
    z.intersection(
      z.object({ trims: z.array(z.object({ removed: text, reason: text })) }),
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('sealed'), block: modelBlock }),
        z.object({
          kind: z.literal('partial'),
          content: z.enum(['text', 'thinking', 'tool-arguments', 'voice']),
          value: text,
        }),
      ]),
    ),
  ),
  next: text.nullable(),
  settlement: z.object({
    version: identity(decodeResultVersion),
    cursor: identity(decodeOutputCursor),
    source: evidence,
    termination: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('completed'),
        reason: z.enum(['stop', 'limit', 'tool-suggestions']),
      }),
      z.object({ kind: z.literal('failed'), fault: modelFault }),
      z.object({ kind: z.literal('interrupted'), control: identity(decodeModelOperationId) }),
    ]),
  }),
})
const terminal = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('completed') }),
  z.object({
    kind: z.literal('failed'),
    cause: z.enum(['arguments', 'environment', 'executor', 'runtime-lost', 'result']),
    diagnostic: text,
  }),
  z.object({ kind: z.literal('unavailable'), reason: text }),
  z.object({
    kind: z.literal('interrupted'),
    cause: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('control'),
        operation: identity(decodeToolOperationId),
        withdrawn: z.boolean(),
      }),
      z.object({ kind: z.literal('foreground-limit') }),
      z.object({ kind: z.literal('resume-rejected'), exclusion: evidence }),
    ]),
  }),
  z.object({ kind: z.literal('no-response'), wait: identity(decodeToolWaitId), reason: text }),
])
const toolPage = z.object({
  result: identity(decodeToolResultVersion),
  terminal,
  actualTerminal: terminal.nullable(),
  effect: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('not-started') }),
    z.object({ kind: z.literal('not-occurred'), evidence }),
    z.object({ kind: z.literal('occurred'), evidence }),
    z.object({ kind: z.literal('unknown'), diagnostic: text }),
  ]),
  relation: z.enum(['original', 'late']),
  delivery: identity(decodeToolDeliveryId),
  source: evidence,
  next: text.nullable(),
  value: z.object({
    content: z.array(block),
    data: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('none') }),
      z.object({
        kind: z.literal('json'),
        contract: adoption,
        schema: z.object({ id: text, revision: text, digest: text }),
        value: json,
      }),
    ]),
    original: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('none') }),
      z.object({ kind: z.literal('offloaded'), source: reference, summary: z.array(block) }),
    ]),
    attachments: z.array(reference),
  }),
})
const produced = z.object({
  producer: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('model'), call: identity(decodeModelCallId) }),
    z.object({ kind: z.literal('tool'), call: identity(decodeToolCallId) }),
  ]),
  version: text.min(1),
  delivery: text.min(1).nullable(),
  source: evidence,
})
export const materialShape: z.ZodType<unknown> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('facts'), schema: adoption, value: json }),
  z.object({ kind: z.literal('model'), result: produced, pages: z.array(modelPage) }),
  z.object({ kind: z.literal('tool'), result: produced, pages: z.array(toolPage) }),
])
