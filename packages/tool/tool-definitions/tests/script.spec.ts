// @module-tag slow
// Starts real processes: a script tool runs its script with the arguments on standard input.
import { spawn } from 'node:child_process'
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { OutputChunk, ProcessHandle } from '@omne-harness/execution-environment-contract'
import { writeJsonText } from '@omne-harness/json-text'
import { createIndependentToolScope, executeTool } from '@omne-harness/tool'
import { readToolRegistration } from '@omne-harness/tool-contract/binding'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { attachScriptHost, createScriptAuthor } from '@omne-harness/tool-definitions'
import type { ShellAuthorEnvironment } from '../src/environment.ts'
import { tree } from '../src/protocol.ts'
import { value } from './run-author.ts'

type Start = Parameters<ShellAuthorEnvironment['command']['start']>[0]

/** A command facility over node's spawn: enough of the real one to run a script and stop it. */
function realCommands(started: Start[]): ShellAuthorEnvironment['command'] {
  return {
    async start(request) {
      started.push(request)
      const child = spawn(request.executable, [...request.args], {
        cwd: request.cwd,
        env: { ...request.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      })
      const chunks: OutputChunk[] = []
      let wake: (() => void) | undefined
      let closed = false
      const offsets = { stdout: 0, stderr: 0 }
      for (const stream of ['stdout', 'stderr'] as const)
        child[stream].on('data', (data: Buffer) => {
          chunks.push({
            stream,
            data: new Uint8Array(data),
            observedOffset: offsets[stream],
          } as OutputChunk)
          offsets[stream] += data.byteLength
          wake?.()
        })
      const startedAt = Date.now()
      const result = new Promise<Awaited<ProcessHandle['result']>>(resolve => {
        child.on('error', () => {
          closed = true
          wake?.()
          resolve({
            kind: 'failed',
            reason: 'unavailable',
            observedDurationMs: 0,
            output: summary(),
          })
        })
        child.on('close', (code, signal) => {
          closed = true
          wake?.()
          resolve({
            kind: 'completed',
            exit:
              code === null
                ? { kind: 'signal', signal: signal ?? 'unknown' }
                : { kind: 'code', code },
            durationMs: Date.now() - startedAt,
            output: summary(),
          })
        })
      })
      const summary = () =>
        ({
          mode: 'separate',
          stdout: { observedBytes: offsets.stdout, discardedBytes: 0 },
          stderr: { observedBytes: offsets.stderr, discardedBytes: 0 },
        }) as Awaited<ProcessHandle['result']>['output']
      child.stdin.on('error', () => {})
      child.stdin.end(request.stdin === undefined ? '' : Buffer.from(request.stdin))
      const handle = {
        process: { id: String(child.pid), generation: '1' },
        outputMode: 'separate',
        outputPolicy: {} as ProcessHandle['outputPolicy'],
        result,
        output: {
          async *[Symbol.asyncIterator]() {
            for (;;) {
              const next = chunks.shift()
              if (next !== undefined) yield next
              else if (closed) return
              else await new Promise<void>(resolve => (wake = resolve))
            }
          },
        },
        async stop() {
          child.kill('SIGKILL')
          return 'confirmed'
        },
      } satisfies ProcessHandle
      return { kind: 'done', requestId: 'r', value: handle } as Awaited<
        ReturnType<ShellAuthorEnvironment['command']['start']>
      >
    },
  } as ShellAuthorEnvironment['command']
}

const parameters = {
  type: 'object',
  properties: { text: { type: 'string', description: 'The text.' } },
  required: ['text'],
}

function world(script: string, tool: Record<string, unknown> = {}) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'script-tool-')))
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'script-cwd-')))
  writeFileSync(join(directory, 'tool.mjs'), script)
  const started: Start[] = []
  const construction = {
    summary: 'A script tool.',
    parameters,
    run: { program: process.execPath, script: 'tool.mjs' },
    effect: 'read',
    ...tool,
  }
  const author = value(createScriptAuthor(tree(construction)))
  const environment = {
    directory: cwd,
    command: realCommands(started),
  } as unknown as ShellAuthorEnvironment
  const place = {
    program: (name: string) => name,
    directory,
    env: { PATH: process.env['PATH'] ?? '', MARK: 'given' },
    resultMaxBytes: 2000,
  }
  async function call(args: unknown, signal = new AbortController().signal) {
    const registration = readToolRegistration(author)
    if (registration?.kind !== 'function') throw new Error('Expected a function tool')
    const text = JSON.stringify(args)
    const parsed = registration.operation.author.parameters.parse({
      original: text,
      effective: text,
      complete: true,
    })
    if ('failure' in parsed) return `refused: ${JSON.stringify(parsed.failure)}`
    const scope = value(
      createIndependentToolScope({
        limits: {
          authorBufferBytes: 65536,
          authorBufferItems: 100,
          authorWaitHistoryBytes: 65536,
          authorWaitHistoryItems: 100,
        },
        signal,
        process: null,
        waits: null,
      }),
    )
    const bound = attachScriptHost(scope, { place: async () => ({ ok: place }) })
    return value(
      await executeTool(parsed.ok, registration.operation.author.executor, environment, bound),
    ) as string
  }
  return { author, call, started, directory, cwd }
}

const ECHO = `
let text = ''
for await (const chunk of process.stdin) text += chunk
const args = JSON.parse(text)
console.log(JSON.stringify({ words: args.text.split(' ').length, cwd: process.cwd(), mark: process.env.MARK, home: process.env.HOME ?? null, keys: Object.keys(process.env).sort() }))
`

describe('the script executor', () => {
  it('is one function tool: the summary is its description, the declared parameters its schema, one gate that asks', () => {
    const { author } = world(ECHO)
    const definition = judgeToolDefinition(
      deriveDefinition(
        {
          asset: {
            name: 'wordcount',
            adoption: { owner: 't', name: 'wordcount', revision: '1', digest: 'sha256:w' },
          },
          requiredCapabilities: [],
        },
        author.facts,
      ),
    )
    if (!('ok' in definition)) throw new Error(JSON.stringify(definition.failure))
    expect(author.facts.description).toBe('A script tool.')
    expect(author.facts.backgroundAllowed).toBe(false)
    expect(author.facts.implements.kind).toBe('function')
    if (author.facts.implements.kind !== 'function') throw new Error('function')
    const { schema, descriptions } = author.facts.implements.parameters
    expect(JSON.parse(writeJsonText(schema))).toEqual({
      type: 'object',
      additionalProperties: false,
      required: ['text'],
      properties: { text: { type: 'string' } },
    })
    expect(descriptions).toEqual([{ path: 'text', text: 'The text.' }])
  })

  it('gives the arguments as JSON on standard input and answers with standard output; the script starts in the directory of the call with only the environment it was given', async () => {
    const { call, started, directory, cwd } = world(ECHO)
    const said = JSON.parse(await call({ text: 'a b c' })) as Record<string, unknown>
    expect(said['words']).toBe(3)
    expect(said['cwd']).toBe(cwd)
    expect(said['mark']).toBe('given')
    expect(said['home']).toBeNull()
    expect((said['keys'] as string[]).filter(key => !key.startsWith('__'))).toEqual([
      'MARK',
      'PATH',
    ])
    expect(started[0]?.args[0]).toBe(join(directory, 'tool.mjs'))
  })

  it('refuses arguments that are not the declared ones before anything starts', async () => {
    const { call, started } = world(ECHO)
    expect(await call({ text: 'a', more: 1 })).toContain('more is not a parameter of this tool')
    expect(await call({})).toContain('text is required')
    expect(started).toEqual([])
  })

  it('answers a failure with the exit code and the end of standard error when the script exits with a code that is not 0', async () => {
    const { call } = world(
      `console.log('partly'); console.error('it broke: no such word'); process.exit(3)`,
    )
    const said = await call({ text: 'a' })
    expect(said.split('\n')[0]).toBe('failed exit=3')
    expect(said).toContain('stderr (its end):\nit broke: no such word')
    expect(said).toContain('stdout:\npartly')
  })

  it('cuts output past the bound and says so', async () => {
    const { call } = world(`process.stdout.write('x'.repeat(5000))`)
    const said = await call({ text: 'a' })
    expect(said.startsWith('x'.repeat(2000))).toBe(true)
    expect(said).toContain(
      '[the output was cut: the script wrote 5000 bytes and the first part is kept]',
    )
    expect(said.length).toBeLessThan(2200)
  })

  it('says a script that wrote nothing is done', async () => {
    const { call } = world('')
    expect(await call({ text: 'a' })).toBe('done (the script wrote nothing)')
  })

  it.each([
    [
      'read',
      'failed reason=time-limit the script ran past its time limit and was stopped. It is not run again.',
    ],
    [
      'write',
      'unknown reason=time-limit the script ran past its time limit and was stopped. Whether it did its work is not known, and it is not run again: check before you call it once more.',
    ],
  ])(
    'stops a %s script at its time limit, once, and answers what is known',
    async (effect, head) => {
      const { call, started } = world(`console.log('began'); setTimeout(() => {}, 60000)`, {
        effect,
        timeoutMs: 1000,
      })
      const said = await call({ text: 'a' })
      expect(said.split('\n')[0]).toBe(head)
      expect(said).toContain('stdout:\nbegan')
      expect(started).toHaveLength(1)
    },
  )

  it('stops the script when the call is cancelled: the call ends as cancelled with its effect unknown', async () => {
    const { call } = world(`setTimeout(() => {}, 60000)`, { effect: 'write' })
    const cancel = new AbortController()
    setTimeout(() => cancel.abort(), 300)
    const began = Date.now()
    await expect(call({ text: 'a' }, cancel.signal)).rejects.toThrow(
      '{"reason":"cancelled: the execution was cancelled","effect":"unknown"}',
    )
    expect(Date.now() - began).toBeLessThan(5000)
  })

  it('refuses a construction that is not one of a script tool', () => {
    expect(createScriptAuthor(tree({ summary: 'x' }))).toMatchObject({
      failure: { field: 'construction' },
    })
  })
})
