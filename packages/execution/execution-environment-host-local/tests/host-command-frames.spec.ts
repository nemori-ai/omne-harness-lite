// The manager side of the command gate, without a scope: the frame reader over the gate's standard
// output, the bounded output buffer with its single reader, the two pure decisions of the scope
// supervisor (when a `show` reading confirms a stop, and which references name a scope of this
// provider), the recovery listing against a stand-in `systemctl`, the gate's refusal to run outside
// its own scope, and the tool runner on a plain Node child. Inputs are byte frames as the gate writes
// them; nothing here claims scope behavior, which `host-command.spec.ts` covers on Linux.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmod, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { OutputChunk } from '@omne-harness/execution-environment-contract'
import type { ScopeRef as ListedScope } from '@omne-harness/runtime-context-contract'
import { createGateReader, createOutputBuffer, type GateFrame } from '../src/host-command.ts'
import {
  confirmationOf,
  listScopes,
  parseShow,
  readScopeReference,
  runTool,
  scopeDescription,
  scopeReference,
} from '../src/host-scope.ts'

const onLinux = process.platform === 'linux'

const encoder = new TextEncoder()

function line(frame: object): Uint8Array {
  return encoder.encode(`${JSON.stringify(frame)}\n`)
}

function data(stream: 'stdout' | 'stderr', text: string): object {
  return { t: 'data', s: stream, b: Buffer.from(text).toString('base64') }
}

function framesOf(
  step: ReturnType<ReturnType<typeof createGateReader>['push']>,
): readonly GateFrame[] {
  if (step.kind !== 'frames') throw new Error(`expected frames, got a fault: ${step.fault}`)
  return step.frames
}

function joined(...parts: Uint8Array[]): Uint8Array {
  return Uint8Array.from(parts.flatMap(part => [...part]))
}

it('reads frames split at any byte boundary, in order, with the data bytes intact', () => {
  const reader = createGateReader({ maxChunkBytes: 64 })
  const bytes = joined(
    line({ t: 'ready' }),
    line({ t: 'started' }),
    line(data('stdout', 'one\r\n')),
    line(data('stderr', '\u001b[31mtwo')),
    line({ t: 'exit', code: 3, signal: null }),
  )
  const frames: GateFrame[] = []
  for (let at = 0; at < bytes.length; at += 7)
    frames.push(...framesOf(reader.push(bytes.slice(at, at + 7))))
  expect(frames).toEqual([
    { kind: 'ready' },
    { kind: 'started' },
    { kind: 'data', stream: 'stdout', bytes: encoder.encode('one\r\n') },
    { kind: 'data', stream: 'stderr', bytes: encoder.encode('\u001b[31mtwo') },
    { kind: 'exit', exit: { kind: 'code', code: 3 } },
  ])
})

it('reports a signal exit and a spawn failure', () => {
  const signalled = createGateReader({ maxChunkBytes: 64 })
  expect(
    framesOf(
      signalled.push(
        joined(
          line({ t: 'ready' }),
          line({ t: 'started' }),
          line({ t: 'exit', code: null, signal: 'SIGTERM' }),
        ),
      ),
    ).at(-1),
  ).toEqual({ kind: 'exit', exit: { kind: 'signal', signal: 'SIGTERM' } })
  const failed = createGateReader({ maxChunkBytes: 64 })
  expect(
    framesOf(failed.push(joined(line({ t: 'ready' }), line({ t: 'spawnFailed', code: 'ENOENT' })))),
  ).toEqual([{ kind: 'ready' }, { kind: 'spawnFailed', code: 'ENOENT' }])
})

it('faults on a line longer than the bound before its newline arrives', () => {
  const reader = createGateReader({ maxChunkBytes: 16 })
  expect(framesOf(reader.push(joined(line({ t: 'ready' }), line({ t: 'started' }))))).toHaveLength(
    2,
  )
  expect(reader.push(encoder.encode('x'.repeat(4096))).kind).toBe('fault')
})

it('faults on a data frame whose bytes exceed the chunk bound', () => {
  const reader = createGateReader({ maxChunkBytes: 4 })
  expect(
    reader.push(joined(line({ t: 'ready' }), line({ t: 'started' }), line(data('stdout', 'fives'))))
      .kind,
  ).toBe('fault')
})

it.each([
  ['malformed JSON', [encoder.encode('{"t":\n')]],
  ['an unknown frame type', [line({ t: 'surprise' })]],
  ['a second ready', [line({ t: 'ready' }), line({ t: 'ready' })]],
  ['data before started', [line({ t: 'ready' }), line(data('stdout', 'early'))]],
  ['started before ready', [line({ t: 'started' })]],
  [
    'data after the exit',
    [
      line({ t: 'ready' }),
      line({ t: 'started' }),
      line({ t: 'exit', code: 0, signal: null }),
      line(data('stdout', 'late')),
    ],
  ],
  [
    'a spawn failure after the start',
    [line({ t: 'ready' }), line({ t: 'started' }), line({ t: 'spawnFailed', code: 'ENOENT' })],
  ],
  [
    'an unknown stream',
    [line({ t: 'ready' }), line({ t: 'started' }), line({ t: 'data', s: 'tty', b: '' })],
  ],
  [
    'bytes that are not base64',
    [line({ t: 'ready' }), line({ t: 'started' }), line({ t: 'data', s: 'stdout', b: '!!' })],
  ],
])('faults on %s, and stays faulted', (_, lines) => {
  const reader = createGateReader({ maxChunkBytes: 64 })
  expect(reader.push(joined(...lines)).kind).toBe('fault')
  expect(reader.push(line({ t: 'ready' })).kind).toBe('fault')
})

async function drain(iterable: AsyncIterable<OutputChunk>): Promise<OutputChunk[]> {
  const chunks: OutputChunk[] = []
  for await (const chunk of iterable) chunks.push(chunk)
  return chunks
}

it('drops a whole chunk that does not fit, counts it per stream, and shows the gap in the next offset', async () => {
  const buffer = createOutputBuffer({ maxBufferedBytes: 10 })
  buffer.push('stdout', encoder.encode('123456'))
  buffer.push('stderr', encoder.encode('ab'))
  buffer.push('stdout', encoder.encode('7890X'))
  expect(buffer.bufferedBytes()).toBeLessThanOrEqual(10)
  buffer.push('stdout', encoder.encode('yz'))
  buffer.close()
  const chunks = await drain(buffer.output)
  expect(chunks).toEqual([
    { stream: 'stdout', data: encoder.encode('123456'), observedOffset: 0 },
    { stream: 'stderr', data: encoder.encode('ab'), observedOffset: 0 },
    { stream: 'stdout', data: encoder.encode('yz'), observedOffset: 11 },
  ])
  expect(buffer.summary()).toEqual({
    mode: 'separate',
    stdout: { observedBytes: 13, discardedBytes: 5 },
    stderr: { observedBytes: 2, discardedBytes: 0 },
  })
})

it('frees room as the reader takes chunks, so a later chunk fits again', async () => {
  const buffer = createOutputBuffer({ maxBufferedBytes: 4 })
  const iterator = buffer.output[Symbol.asyncIterator]()
  buffer.push('stdout', encoder.encode('abcd'))
  expect(await iterator.next()).toEqual({
    done: false,
    value: { stream: 'stdout', data: encoder.encode('abcd'), observedOffset: 0 },
  })
  buffer.push('stdout', encoder.encode('efgh'))
  buffer.close()
  expect(await iterator.next()).toMatchObject({ value: { observedOffset: 4 } })
  expect(await iterator.next()).toEqual({ done: true, value: undefined })
  expect(buffer.summary()).toMatchObject({ stdout: { observedBytes: 8, discardedBytes: 0 } })
})

it('has one reader: a second iterator rejects its first next with TypeError', async () => {
  const buffer = createOutputBuffer({ maxBufferedBytes: 64 })
  const first = buffer.output[Symbol.asyncIterator]()
  const second = buffer.output[Symbol.asyncIterator]()
  await expect(second.next()).rejects.toThrow(TypeError)
  buffer.push('stdout', encoder.encode('kept'))
  expect(await first.next()).toMatchObject({ done: false })
})

it('counts every byte after the reader gives up as discarded, buffered bytes included', async () => {
  const buffer = createOutputBuffer({ maxBufferedBytes: 64 })
  const iterator = buffer.output[Symbol.asyncIterator]()
  buffer.push('stdout', encoder.encode('read'))
  await iterator.next()
  buffer.push('stdout', encoder.encode('queued'))
  await iterator.return?.()
  buffer.push('stderr', encoder.encode('after'))
  buffer.close()
  expect(buffer.bufferedBytes()).toBe(0)
  expect(buffer.summary()).toEqual({
    mode: 'separate',
    stdout: { observedBytes: 10, discardedBytes: 6 },
    stderr: { observedBytes: 5, discardedBytes: 5 },
  })
})

it('ends a waiting reader when the output closes', async () => {
  const buffer = createOutputBuffer({ maxBufferedBytes: 64 })
  const waiting = buffer.output[Symbol.asyncIterator]().next()
  buffer.close()
  expect(await waiting).toEqual({ done: true, value: undefined })
})

it('confirms a stop only for an inactive or unknown unit, read from systemctl show', () => {
  expect(confirmationOf(parseShow('LoadState=not-found\nActiveState=inactive\n'))).toBe('confirmed')
  expect(confirmationOf(parseShow('ActiveState=inactive\nLoadState=loaded\n'))).toBe('confirmed')
  expect(confirmationOf(parseShow('LoadState=loaded\nActiveState=active\n'))).toBe('unconfirmed')
  expect(confirmationOf(parseShow('LoadState=loaded\nActiveState=deactivating\n'))).toBe(
    'unconfirmed',
  )
  // A scope killed by a signal may read `failed` for a moment: it is not counted as stopped.
  expect(confirmationOf(parseShow('LoadState=loaded\nActiveState=failed\n'))).toBe('unconfirmed')
  expect(confirmationOf(parseShow(''))).toBe('unconfirmed')
  expect(confirmationOf(undefined)).toBe('unconfirmed')
})

it('reads back only references to a scope this provider names, so recovery cannot stop another unit', () => {
  const unit = 'omne-host-0b9c3a2e-5f0d-4d7e-9c51-2a0e6c1d4b7f.scope'
  const bootId = '3ac8e79f-51c7-4338-8d62-c611f07eccf1'
  expect(readScopeReference(scopeReference({ unit, bootId }))).toEqual({ unit, bootId })
  for (const foreign of [
    'dbus.service',
    'omne-host-probe-x.scope',
    'omne-host-../x.scope',
    'a.scope',
  ])
    expect(readScopeReference(scopeReference({ unit: foreign, bootId }))).toBeUndefined()
  expect(readScopeReference({ kind: 'null' })).toBeUndefined()
  expect(readScopeReference({ kind: 'string', value: unit })).toBeUndefined()
})

it('runs a supervisor tool within a bound that carries a fraction, and answers failed for a tool that cannot start', async () => {
  // Stop deadlines come from the monotonic clock, so the time left is rarely a whole number.
  expect(await runTool(process.execPath, ['-e', 'process.stdout.write("ok")'], 9999.25)).toEqual({
    kind: 'exited',
    code: 0,
    stdout: 'ok',
  })
  expect(await runTool(process.execPath, ['-e', 'process.exit(5)'], 9999.25)).toMatchObject({
    kind: 'exited',
    code: 5,
  })
  expect(await runTool('/nonexistent/omne-tool', [], 100.5)).toEqual({ kind: 'failed' })
})

// ---------------------------------------------------------------------------------------------
// The recovery listing: a failed listing is `unavailable`, never an empty list

function isScopeText(text: string): text is ListedScope['ref'] {
  return text.length > 0
}

function scopeOf(text: string): ListedScope {
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

/** Runs `check` with a stand-in `systemctl` that answers the listing with `body` (a shell script). */
async function withSystemctl(body: string, check: (systemctl: string) => Promise<void>) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'omne-host-systemctl-')))
  try {
    const systemctl = join(directory, 'systemctl')
    await writeFile(systemctl, `#!/bin/sh\n${body}\n`)
    await chmod(systemctl, 0o755)
    await check(systemctl)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

const listing = (systemctl: string, scope: ListedScope) =>
  listScopes({ systemctl, scope, provider: 'host-files', boundMs: 5000 })

it.skipIf(!onLinux)('lists the scopes whose description names the requester scope', async () => {
  const scope = scopeOf('scope-listing-a')
  const key = '0b9c3a2e-5f0d-4d7e-9c51-2a0e6c1d4b7f'
  const mine = { unit: `omne-host-${key}.scope`, description: scopeDescription(scope, key) }
  const other = {
    unit: 'omne-host-6d1c0f4a-7a2b-4f19-8f3c-9b0a5e2d7c11.scope',
    description: scopeDescription(
      scopeOf('scope-listing-b'),
      '6d1c0f4a-7a2b-4f19-8f3c-9b0a5e2d7c11',
    ),
  }
  await withSystemctl(`echo '${JSON.stringify([mine, other])}'`, async systemctl => {
    const answer = await listing(systemctl, scope)
    if (answer.kind !== 'listed') throw new Error(`expected a listing: ${JSON.stringify(answer)}`)
    expect(answer.resources.map(resource => resource.key)).toEqual([key])
  })
})

it.skipIf(!onLinux)(
  'answers unavailable, not an empty list, when the listing command fails or does not answer a list',
  async () => {
    const scope = scopeOf('scope-listing-a')
    const failing = 'echo "Failed to connect to bus" >&2; exit 1'
    await withSystemctl(failing, async systemctl => {
      expect(await listing(systemctl, scope)).toEqual({ kind: 'unavailable' })
    })
    await withSystemctl('echo "not json"', async systemctl => {
      expect(await listing(systemctl, scope)).toEqual({ kind: 'unavailable' })
    })
    await withSystemctl('echo "{}"', async systemctl => {
      expect(await listing(systemctl, scope)).toEqual({ kind: 'unavailable' })
    })
    expect(await listing('/nonexistent/omne-systemctl', scope)).toEqual({ kind: 'unavailable' })
  },
)

it.skipIf(onLinux)('answers unavailable where the host gives no boot identity', async () => {
  expect(await listing('/nonexistent/omne-systemctl', scopeOf('scope-listing-a'))).toEqual({
    kind: 'unavailable',
  })
})

// ---------------------------------------------------------------------------------------------
// The gate outside a scope of its own

it.skipIf(!onLinux)(
  'exits 2 without reporting ready when the gate does not run in its own scope',
  async () => {
    const gate = fileURLToPath(new URL('../dist/command-gate.js', import.meta.url))
    const child = spawn(process.execPath, [gate, `omne-host-${'0'.repeat(8)}.scope`], {
      stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    })
    let frames = ''
    child.stdout?.on('data', (chunk: Buffer) => (frames += chunk.toString('utf8')))
    child.stderr?.resume()
    const control = child.stdio[3]
    if (control === null || control === undefined || !('write' in control))
      throw new Error('expected a control pipe')
    control.end(
      `${JSON.stringify({
        executable: '/bin/true',
        args: [],
        cwd: '/',
        env: {},
        stdin: null,
        maxChunkBytes: 1024,
      })}\n`,
    )
    const [code] = await once(child, 'close')
    expect(code).toBe(2)
    expect(frames).toBe('')
  },
)
