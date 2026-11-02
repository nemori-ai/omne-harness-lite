import { expect, it } from 'vitest'
import { createIndependentToolScope } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { createShellAuthor, type ShellAuthorEnvironment } from '@omne-harness/tool-definitions'
import type { ProcessHandle } from '@omne-harness/execution-environment-contract'
import { shellFixture } from './fixtures/shell.ts'
import { run, value } from './run-author.ts'

it('stops only the interrupted handle and preserves unconfirmed while another invocation completes', async () => {
  const fixture = shellFixture()
  const author = value(createShellAuthor(fixture.config))
  const controller = new AbortController()
  const stopped: string[] = []
  let closed = 0
  const handle = (id: string): ProcessHandle => ({
    ...fixture.process(id, 'separate'),
    process: { id, generation: '1' },
    output: {
      async *[Symbol.asyncIterator]() {
        yield { stream: 'stdout', observedOffset: 0, data: new TextEncoder().encode(id) }
        if (id === 'interrupt') controller.abort()
      },
    },
    stop: async () => {
      stopped.push(id)
      return 'unconfirmed'
    },
  })
  const environment: ShellAuthorEnvironment = {
    ...fixture.environment,
    command: {
      start: async request => ({
        kind: 'done',
        requestId: 'fixture',
        value: handle(request.args.at(-1) ?? ''),
      }),
    },
    terminal: {
      ...fixture.environment.terminal,
      close: async request => {
        closed += 1
        return fixture.environment.terminal.close(request)
      },
    },
  }
  const registration = readToolRegistration(author)
  if (registration?.kind !== 'commands') throw new Error('commands')
  const operation = registration.operations.find(([name]) => name === 'execute')?.[1]
  if (operation === undefined) throw new Error('execute')
  const text = JSON.stringify({ script: 'interrupt' })
  const args = value(
    operation.author.parameters.parse({ original: text, effective: text, complete: true }),
  )
  const scope = value(
    createIndependentToolScope({
      signal: controller.signal,
      process: null,
      waits: null,
      limits: {
        authorBufferBytes: 1024,
        authorBufferItems: 8,
        authorWaitHistoryBytes: 1024,
        authorWaitHistoryItems: 8,
      },
    }),
  )
  const [interrupted, other] = await Promise.all([
    operation.author.executor.execute(args, environment, scope.context),
    run(author, 'execute', { script: 'other' }, environment),
  ])
  expect(interrupted).toContain('unknown')
  expect(interrupted).toContain('stop=unconfirmed')
  expect(other).toContain('done')
  expect(other).toContain('stop=not-requested')
  expect(stopped).toEqual(['interrupt'])
  expect(closed).toBe(0)
  expect(await scope.finish('returned')).toHaveProperty('failure')
})

it('distinguishes facility offset loss from tool truncation and retains output-failure uncertainty', async () => {
  const fixture = shellFixture()
  const author = value(createShellAuthor(fixture.config))
  const original = fixture.process('unused', 'separate')
  const environment: ShellAuthorEnvironment = {
    ...fixture.environment,
    command: {
      start: async () => ({
        kind: 'done',
        requestId: 'fixture',
        value: {
          ...original,
          output: {
            async *[Symbol.asyncIterator]() {
              yield { stream: 'stdout', observedOffset: 5, data: new TextEncoder().encode('头尾') }
              throw new Error('lost output')
            },
          },
          result: Promise.resolve({
            kind: 'failed',
            reason: 'effectUnknown',
            observedDurationMs: 7,
            output: {
              mode: 'separate',
              stdout: { observedBytes: 11, discardedBytes: 5 },
              stderr: { observedBytes: 0, discardedBytes: 0 },
            },
          }),
        },
      }),
    },
  }
  const result = await run(author, 'execute', { script: 'command' }, environment)
  expect(result).toContain('unknown')
  expect(result).toContain('facility_gaps=0..5')
  expect(result).toContain('facility_discarded_bytes=5')
  expect(result).toContain('discarded_observed_bytes=5')
  expect(result).toContain('output_reader=unknown')
  expect(result).not.toContain('tool truncated')
})

it('rejects missing shell configuration and malformed terminal/geometry before starting', async () => {
  const fixture = shellFixture()
  expect(
    createShellAuthor({
      kind: 'object',
      entries: [{ key: 'resultMaxBytes', value: { kind: 'number', lexeme: '512' } }],
    }),
  ).toHaveProperty('failure')
  const author = value(createShellAuthor(fixture.config))
  await expect(
    run(author, 'execute', { script: 'x', terminal: { id: 'bad' } }, fixture.environment),
  ).rejects.toThrow('invalid-field:terminal')
  expect(await run(author, 'create_session', { columns: 80 }, fixture.environment)).toContain(
    'invalidInput',
  )
  const controller = new AbortController()
  controller.abort()
  await expect(
    run(author, 'execute', { script: 'x' }, fixture.environment, controller.signal),
  ).rejects.toThrow()
  expect(fixture.starts).toHaveLength(0)
})
