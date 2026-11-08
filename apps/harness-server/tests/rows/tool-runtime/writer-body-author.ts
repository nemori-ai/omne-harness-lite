import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolRenderedResult } from '@omne-harness/tool-contract'
import {
  defaultResultPolicy,
  describedAdoption,
  type OutputCodec,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { createLargeBodyModule, largeBodyModule } from './large-body-author.ts'

const frames = ['W3-BEGIN\n', '中🙂'.repeat(2048), '\nW3-END\n']
export const WRITER_BODY = frames.join('')
export const WRITER_SUMMARY = 'W3-BEGIN: author summary; the complete answer is in the body. W3-END'

const codec: OutputCodec<ToolRenderedResult<ToolMessageContentBlock>> = {
  adoption: describedAdoption({ owner: 'w3-release-test', name: 'writer-output', revision: '1' }),
  encode(value) {
    const bytes = Buffer.from(JSON.stringify(value))
    const checked = this.decode(bytes)
    return 'failure' in checked ? checked : succeed(bytes)
  },
  decode(bytes) {
    if (bytes.byteLength > 65_536) return fail({ reason: 'writer-output-too-large' })
    try {
      const value: ToolRenderedResult<ToolMessageContentBlock> = JSON.parse(
        Buffer.from(bytes).toString('utf8'),
      )
      return defaultResultPolicy.judgeResult(value)
    } catch {
      return fail({ reason: 'invalid-writer-output' })
    }
  },
}

function ok<T>(value: Outcome<T, unknown>): T {
  if ('failure' in value) throw new Error(JSON.stringify(value.failure))
  return value.ok
}

export function writerBodyAuthor() {
  let executions = 0
  const pending: Promise<unknown>[] = []
  const representation = { kind: 'text' as const, codec: largeBodyModule.executor }
  const module = createLargeBodyModule(
    {
      execute: async (_arguments, _environment, context) => {
        executions += 1
        ok(await context.body.begin('answer', representation))
        for (const [index, text] of frames.entries())
          ok(
            await context.body.append('answer', String(index + 1), {
              kind: 'text',
              block: 'answer',
              text,
              end: index === frames.length - 1,
            }),
          )
        const sealed = ok(await context.body.seal('answer', String(frames.length)))
        ok(await context.body.begin('unadopted', representation))
        pending.push(
          context.body.append('unadopted', '1', {
            kind: 'text',
            block: 'unused',
            text: 'not part of the answer',
            end: true,
          }),
        )
        pending.push(context.body.seal('unadopted', '1'))
        const summary = [
          {
            kind: 'text',
            id: 'summary',
            text: WRITER_SUMMARY,
            visibility: { toModel: true, toHuman: true },
          },
        ]
        return ok(
          codec.decode(
            Buffer.from(
              JSON.stringify({
                content: summary,
                original: { kind: 'offloaded', source: sealed.source, summary },
                data: { kind: 'none' },
                attachments: [],
              }),
            ),
          ),
        )
      },
    },
    codec,
  )
  return { module, executions: () => executions, pending }
}
