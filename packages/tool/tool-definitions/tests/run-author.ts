import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { ENCODING } from '../src/author.ts'
import type {
  ToolImplementation,
  ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'

export async function run<E>(
  implementation: ToolImplementation<E, ToolMessageContentBlock>,
  command: string,
  args: unknown,
  environment: E,
  signal = new AbortController().signal,
) {
  const registration = readToolRegistration(implementation)
  if (registration?.kind !== 'commands') throw new Error('Expected commands')
  const operation = registration.operations.find(([name]) => name === command)?.[1]
  if (operation === undefined) throw new Error('Missing command')
  const text = callText(command, args)
  const parsed = operation.author.parameters.parse({
    original: text,
    effective: text,
    complete: true,
  })
  if ('failure' in parsed) throw new Error(JSON.stringify(parsed.failure))
  const scope = createIndependentToolScope({
    limits: {
      authorBufferBytes: 65536,
      authorBufferItems: 100,
      authorWaitHistoryBytes: 65536,
      authorWaitHistoryItems: 100,
    },
    signal,
    process: null,
    waits: null,
  })
  if ('failure' in scope) throw new Error(JSON.stringify(scope.failure))
  const answer = await executeTool(parsed.ok, operation.author.executor, environment, scope.ok)
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  if (typeof answer.ok !== 'string') throw new Error('Expected readable text')
  return answer.ok
}

/** The arguments text a model sends: the whole call, from which the command codec cuts the parameters. */
export function callText(command: string, args: unknown): string {
  return JSON.stringify(
    ENCODING === 'flat' ? { command, ...(args as object) } : { command, params: args },
  )
}

export function value<T>(answer: { ok: T } | { failure: unknown }): T {
  if ('failure' in answer) throw new Error(JSON.stringify(answer.failure))
  return answer.ok
}
