import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { record } from '../src/demo-ipc.ts'
import { createDemoSupervisor, type DemoSupervisorOptions } from '../src/demo-supervisor.ts'
import { createLocalTls } from './local-tls.ts'

async function logBytes(dataDirectory: string): Promise<string> {
  const root = join(dataDirectory, 'session-logs')
  const files = (await readdir(root, { recursive: true })).filter(path =>
    path.endsWith('entries.jsonl'),
  )
  return (await Promise.all(files.map(path => readFile(join(root, path), 'utf8')))).join('')
}

function responseValues(serialized: string): readonly unknown[] {
  const responses: unknown[] = []
  for (const line of serialized.split('\n').filter(Boolean)) {
    const batch: unknown = JSON.parse(line)
    if (!record(batch) || !Array.isArray(batch.entries)) throw new Error('invalid test log batch')
    for (const entry of batch.entries) {
      if (!record(entry) || !record(entry.payload)) throw new Error('invalid test log entry')
      if (entry.payload.category === 'response') responses.push(entry.payload.value)
    }
  }
  return responses
}

function openedTime(serialized: string): string {
  for (const line of serialized.split('\n').filter(Boolean)) {
    const batch: unknown = JSON.parse(line)
    if (!record(batch) || !Array.isArray(batch.entries)) throw new Error('invalid test log batch')
    for (const entry of batch.entries) {
      if (!record(entry) || !record(entry.payload) || !record(entry.payload.value)) continue
      if (
        entry.payload.value.kind === 'model_call_opened' &&
        typeof entry.payload.value.firstTokenAt === 'string'
      )
        return entry.payload.value.firstTokenAt
    }
  }
  throw new Error('durable opened anchor absent')
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function openWithResponseWriterFault(
  supervisor: ReturnType<typeof createDemoSupervisor>,
  marker: string,
  mode: 'after-write' | 'before-write',
) {
  const originalOptions = process.env.NODE_OPTIONS
  const originalMarker = process.env.OMNE_TEST_RESPONSE_WRITER_MARKER
  const originalMode = process.env.OMNE_TEST_RESPONSE_WRITER_MODE
  const preload = new URL('./response-writer-cold-recovery-fixture.mjs', import.meta.url).href
  process.env.NODE_OPTIONS = `${originalOptions ?? ''} --import=${preload}`.trim()
  process.env.OMNE_TEST_RESPONSE_WRITER_MARKER = marker
  process.env.OMNE_TEST_RESPONSE_WRITER_MODE = mode
  try {
    return await supervisor.open()
  } finally {
    if (originalOptions === undefined) delete process.env.NODE_OPTIONS
    else process.env.NODE_OPTIONS = originalOptions
    if (originalMarker === undefined) delete process.env.OMNE_TEST_RESPONSE_WRITER_MARKER
    else process.env.OMNE_TEST_RESPONSE_WRITER_MARKER = originalMarker
    if (originalMode === undefined) delete process.env.OMNE_TEST_RESPONSE_WRITER_MODE
    else process.env.OMNE_TEST_RESPONSE_WRITER_MODE = originalMode
  }
}

describe('response writer cold recovery with an actual stopped worker', () => {
  for (const mode of ['after-write', 'before-write'] as const) {
    it(`reconciles a response writer with ${mode} uncertainty from the authoritative log`, async () => {
      const root = await mkdtemp(join(tmpdir(), `cold-response-writer-${mode}-`))
      const dataDirectory = join(root, 'data')
      const marker = join(root, 'fault-hit')
      const keyFile = join(root, 'key')
      await writeFile(keyFile, 'controlled-local-key', { mode: 0o600 })
      const server = await createLocalTls(join(root, 'tls'))
      const options: DemoSupervisorOptions = {
        dataDirectory,
        keyFile,
        multiplier: '1.1',
        reserveTokens: '256',
        maxOutputTokens: 128,
        retirementWaitMilliseconds: 2000,
        maxPacketBytes: 1_048_576,
        maxCommands: 1,
        dedicatedRoot: true,
        developmentTransport: {
          baseUrl: server.developmentTransport.baseUrl,
          ca: server.developmentTransport.tls.ca,
        },
      }
      const supervisor = createDemoSupervisor(options)
      try {
        const original = await openWithResponseWriterFault(supervisor, marker, mode)
        const sending = original.send(`response write ${mode}`, async () => undefined)
        await vi.waitFor(
          async () =>
            expect(await readFile(marker, 'utf8')).toBe(
              mode === 'after-write'
                ? 'after-response-write-before-datasync'
                : 'before-response-write',
            ),
          { timeout: 10_000 },
        )
        await vi.waitFor(
          async () =>
            expect(await readFile(`${marker}.repair-failed`, 'utf8')).toBe(
              'response-repair-failed',
            ),
          { timeout: 10_000 },
        )
        expect(supervisor.inspect().state).toBe('alive')
        expect(server.requests).toHaveLength(1)
        const before = await logBytes(dataDirectory)
        expect(responseValues(before)).toHaveLength(mode === 'after-write' ? 1 : 0)
        const firstTokenAt = openedTime(before)
        const beforeDigest = digest(before)
        expect(supervisor.signalWorker('SIGKILL')).toBe(true)
        expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
        expect((await sending).kind).toBe('unconfirmed')

        const recovered = await supervisor.open()
        expect(recovered.workerIdentity).not.toBe(original.workerIdentity)
        expect(recovered.session).toBe(original.session)
        expect(server.requests).toHaveLength(1)
        const after = await logBytes(dataDirectory)
        const responses = responseValues(after)
        expect(responses).toHaveLength(1)
        if (mode === 'after-write') {
          expect(digest(after)).toBe(beforeDigest)
          expect(responses[0]).toMatchObject({
            outcome: 'complete',
            timing: { firstTokenAt, sentAt: expect.any(String) },
            usage: { cache_write_tokens: 0, source: 'upstream' },
            cost: { cost_usd: 0.0000117, source: 'upstream_usage' },
          })
          const totals = await recovered.totals()
          expect(totals.responses).toBe(1)
          expect(totals.cost.knownSum.toString()).toBe('0.0000117')
          expect(totals.cost.unknownCount).toBe(0)
        } else {
          expect(digest(after)).not.toBe(beforeDigest)
          expect(responses[0]).toMatchObject({
            outcome: 'interrupted',
            initiator: 'runtime_lost',
            timing: { sentAt: null, firstTokenAt },
            usage: { source: 'none' },
            cost: { cost_usd: 'unknown', source: 'none' },
          })
          const totals = await recovered.totals()
          expect(totals.responses).toBe(1)
          expect(totals.cost.unknownCount).toBe(1)
        }
        expect(server.requests).toHaveLength(1)
        expect((await recovered.close()).complete).toBe(true)
        expect(await supervisor.waitWorkerExit()).toEqual({ exited: true, closed: true })
      } finally {
        if (supervisor.inspect().state === 'alive' || supervisor.inspect().state === 'starting') {
          if (supervisor.signalWorker('SIGKILL')) await supervisor.waitWorkerExit()
        }
        await server.close()
      }
    }, 45_000)
  }
})
