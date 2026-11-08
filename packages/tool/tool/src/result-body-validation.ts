import type { ContentBlock } from '@omne-harness/content-block'
import { readJsonText } from '@omne-harness/json-text'
import { fail, succeed } from '@omne-harness/operation-result'
import type { FixedToolRequest, Reply, ToolRenderedResult } from '@omne-harness/tool-contract'
import type { ToolConfiguration, ToolLedgerPorts } from './construction.ts'
import { resultBodyPolicy } from './result-offloading.ts'

export async function checkToolResultBody<B extends ContentBlock>(
  input: Readonly<{
    request: FixedToolRequest
    result: ToolRenderedResult<B>
    configuration: Pick<ToolConfiguration, 'offloading' | 'readResultArguments'>
    schemas?: ToolLedgerPorts<unknown>['bodySchemas']
  }>,
): Reply<void> {
  const fixed = resultBodyPolicy(
    input.request,
    input.configuration.offloading,
    input.configuration.readResultArguments,
  )
  if ('failure' in fixed) return fixed
  const policy = fixed.ok
  const declaration = policy.declaration
  const texts = input.result.content.flatMap(block =>
    block.kind === 'text' && block.visibility.toModel ? [block.text] : [],
  )
  const invalid = (reason: string) => fail({ kind: 'invalid' as const, field: 'body', reason })
  if (declaration.kind === 'none')
    return texts.length === 0 && input.result.original.kind === 'none'
      ? succeed(undefined)
      : invalid('body declaration forbids model text and offloaded bodies')
  if (input.result.original.kind === 'offloaded') return succeed(undefined)
  if (texts.some(text => !text.isWellFormed())) return invalid('invalid-unicode-text')
  const bytes = texts.reduce((total, text) => total + BigInt(Buffer.byteLength(text, 'utf8')), 0n)
  if (bytes > BigInt(policy.maxBodyBytes)) return invalid('body-too-large')
  if (declaration.kind === 'text') return succeed(undefined)
  const limits = policy.jsonLimits
  if (limits === null) return invalid('JSON validation budget missing')
  const text = texts.join('')
  if (declaration.kind === 'json-lines' && text !== '' && !text.endsWith('\n'))
    return invalid('JSON Lines requires a terminating LF for each record')
  const schema = declaration.kind === 'json-document' ? declaration.document : declaration.record
  const records = declaration.kind === 'json-document' ? [text] : jsonLines(text)
  for (const record of records) {
    const read = readJsonText(record, limits)
    if (read.kind !== 'ok') return invalid(`JSON body ${read.kind}`)
    if (input.schemas === undefined)
      return fail({
        kind: 'unavailable',
        dependency: 'bodySchemas',
        diagnostic: 'body schema checker missing',
      })
    try {
      const checked = await input.schemas.check(schema, read)
      if ('failure' in checked) return checked
    } catch {
      return fail({
        kind: 'unavailable',
        dependency: 'bodySchemas',
        diagnostic: 'body schema checker failed',
      })
    }
  }
  return succeed(undefined)
}

function* jsonLines(text: string): Iterable<string> {
  for (let start = 0; start < text.length;) {
    const end = text.indexOf('\n', start)
    yield text.slice(start, end)
    start = end + 1
  }
}
