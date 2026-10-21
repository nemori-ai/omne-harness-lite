import { createHash } from 'node:crypto'
import { judgeContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  createDefaultParameterCodec,
  defaultResultPolicy,
  defineFunctionTool,
  defineToolOperation,
  type Access,
  type Adoption,
  type DurableEvidence,
  type ToolMessageContentBlock,
  type ToolResult,
} from '@omne-harness/tool-contract'

export function valueOf<T>(answer: Outcome<T, unknown>): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}

export function adoption(name: string): Adoption {
  return { owner: 'tool-tutorial', name, revision: '1', digest: `sha256:${name}` }
}

export function evidence(record: string, value: unknown, owner = 'tool-tutorial'): DurableEvidence {
  // This helper creates a reference, not storage. The caller owns record retention.
  return {
    owner,
    record,
    revision: '1',
    digest: `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`,
  }
}

export const argumentLimits = {
  maxBytes: 65_536,
  maxDepth: 32,
  maxItems: 512,
  maxMembers: 128,
  maxStringLength: 32_768,
  maxNumberLength: 64,
}

export function textResult(texts: readonly string[]): ToolResult<ToolMessageContentBlock> {
  return {
    content: texts.map((text, index) => {
      const block = judgeContentBlock({
        kind: 'text',
        id: `report-${index}`,
        visibility: { toHuman: true, toModel: true },
        text,
      })
      if ('rejected' in block) throw new Error(JSON.stringify(block.rejected))
      return valueOf(defaultResultPolicy.judge(block.ok))
    }),
    data: { kind: 'none' },
    original: { kind: 'none' },
    attachments: [],
  }
}

export function createReportTool() {
  let executions = 0
  const codec = {
    adoption: adoption('report-text-codec'),
    encode: (value: unknown) =>
      typeof value === 'string'
        ? succeed(new TextEncoder().encode(value))
        : fail({ reason: 'Report output must be text' }),
    decode: (bytes: Uint8Array) => succeed(new TextDecoder().decode(bytes)),
  }
  const operation = valueOf(
    defineToolOperation({
      parameters: {
        kind: 'declared',
        value: {
          schema: {
            kind: 'object',
            entries: [],
          },
          vocabulary: adoption('json-schema'),
          descriptions: [
            {
              path: '$',
              text: 'Complete strict JSON. Duplicate keys are invalid. No schema validation is performed.',
            },
          ],
        },
      },
      returns: { kind: 'ordinary', program: { kind: 'none' } },
      author: {
        kind: 'ordinary',
        // This codec uses the strict JSON parser, including duplicate-key rejection.
        parameters: valueOf(createDefaultParameterCodec(argumentLimits)),
        waits: [],
        executor: {
          execute: async (_argumentsValue: unknown, _environment: Access<string>) => {
            executions += 1
            return [
              'Report section 1: settlement confirms the original result. ' +
                'The ledger keeps the complete result independently. '.repeat(38),
              'Report section 2: execution capacity and delivery have separate owners. ' +
                'The consumer reads and processes every result page. '.repeat(38),
              'Report section 3: releaseDelivery confirms the consumer handoff. ' +
                'The fixed result remains readable after that handoff. '.repeat(38),
            ].join('\n\n')
          },
        },
        codec,
        output: {
          adoption: adoption('report-text-output'),
          check: ({ value }: Readonly<{ value: unknown }>) =>
            typeof value === 'string' ? succeed(value) : fail({ reason: 'Expected report text' }),
        },
        renderer: { render: (value: string) => succeed(value) },
        program: { kind: 'none' },
      },
    }),
  )
  const author = valueOf(
    defineFunctionTool({
      metadata: {
        adoption: adoption('report'),
        name: 'report',
        description: 'Generate a read-only report about Tool result delivery.',
        requiredCapabilities: [],
        backgroundAllowed: false,
        declarations: {
          adoption: adoption('report-declarations'),
          environment: null,
          attachments: [],
          inputModalities: ['text'],
          outputModalities: ['text'],
          settings: null,
        },
      },
      operation,
    }),
  )
  return { author, executions: () => executions }
}
