import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { record } from '../src/demo-ipc.ts'
import { createDemoSupervisor, type DemoSupervisorOptions } from '../src/demo-supervisor.ts'
import {
  createAcceptanceApplication,
  createDemoConfig,
  createDemoDiagnosticConfig,
  openDemoDiagnosticAssembly,
  readPrivateFile,
} from '../src/index.ts'
import { demoRetirement } from './model-request-support.ts'
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

describe('independent calibration preservation with original writer unknown and zero-model cold recovery', () => {
  for (const mode of ['after-write', 'before-write'] as const) {
    it(`reconciles a response writer with ${mode} uncertainty from the authoritative log`, async () => {
      const evidence = resolve(import.meta.dirname, '../../../tmp/calibration-acceptance')
      await mkdir(evidence, { recursive: true, mode: 0o700 })
      const root = await mkdtemp(join(evidence, `cold-calibration-${mode}-`))
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
        const exited = await supervisor.waitWorkerExit()
        expect(exited).toEqual({ exited: true, closed: true })
        expect((await sending).kind).toBe('unconfirmed')

        // No model contributions and no credential lookup are required to recognize the original
        // committed values. The exact predecessor scope is backed by actual exit AND close.
        let app: ReturnType<typeof createAcceptanceApplication> | undefined
        const base = createDemoConfig(
          dataDirectory,
          `calibration-cold-${mode}`,
          () => {
            const at = app?.currentTime()
            if (!at || at === 'unavailable') throw Error('real clock absent')
            return at
          },
          { multiplier: 1.1, reserveTokens: 256 },
          demoRetirement(),
          {
            current: `calibration-cold-${mode}`,
            async observeExit(identity) {
              return identity === original.workerIdentity && exited.exited && exited.closed
                ? 'exited'
                : 'unknown'
            },
          },
        )
        if (!base.modelRequest) throw Error('model stage absent')
        const config = {
          ...base,
          modelRequest: {
            ...base.modelRequest,
            transport: { ...base.modelRequest.transport, definitions: [], inputMeters: [] },
          },
        }
        app = createAcceptanceApplication(config, {
          stage: 'modelRequest',
          coldRecovery: { covered: exited.exited && exited.closed },
          developmentTransport: server.developmentTransport,
          diagnostics: { record() {} },
        })
        await app.ready
        const local = JSON.parse(
          (await readPrivateFile(join(dataDirectory, 'demo-state.json'))).toString(),
        ) as { identifier: string; password: string; session: string }
        const who = await app.authenticate(local.identifier, local.password)
        if (!('account' in who)) throw Error('real authentication failed')
        const diagnostics = await openDemoDiagnosticAssembly(
          createDemoDiagnosticConfig(dataDirectory, who.tenant, demoRetirement()),
        )
        try {
          expect(
            await app.activateModelRequest(who, diagnostics, diagnostics.transports),
          ).toHaveProperty('activated')
          expect(await app.prepareSession(who, local.session)).toHaveProperty('session')
          expect(await app.reconcileModelRuntime(who, local.session)).toHaveProperty('calls')
          const after = await logBytes(dataDirectory)
          const responses = responseValues(after)
          expect(responses).toHaveLength(1)
          if (mode === 'after-write') {
            expect(digest(after)).toBe(beforeDigest)
            expect(responses[0]).toEqual(responseValues(before)[0])
            expect(responses[0]).toMatchObject({
              outcome: 'complete',
              inputCalibration: {
                requestInput: { kind: 'known' },
                observedInput: { kind: 'from_usage' },
                outputGroup: { kind: 'known', source: 'reply', completeness: 'complete' },
              },
            })
            const physical = before
              .split('\n')
              .filter(Boolean)
              .map(line => JSON.parse(line) as { entries: { payload: { category: string } }[] })
            const responseBatch = physical.find(batch =>
              batch.entries.some(entry => entry.payload.category === 'response'),
            )!
            expect(responseBatch.entries.map(entry => entry.payload.category)).toEqual([
              'message',
              'response',
            ])
          } else {
            expect(digest(after)).not.toBe(beforeDigest)
            expect(responses[0]).toMatchObject({
              outcome: 'interrupted',
              initiator: 'runtime_lost',
              timing: { sentAt: null, firstTokenAt },
              usage: { source: 'none' },
              inputCalibration: {
                requestInput: { kind: 'unavailable', reason: 'send_unknown' },
                observedInput: { kind: 'unavailable', reason: 'send_unknown' },
                outputGroup: { kind: 'unavailable', reason: 'send_unknown' },
              },
            })
          }
          expect(await app.reconcileModelRuntime(who, local.session)).toHaveProperty('calls')
          expect(await logBytes(dataDirectory)).toBe(after)
          expect(server.requests).toHaveLength(1)
          expect((await diagnostics.closeAfterBusiness(() => app!.close())).complete).toBe(true)
        } finally {
          await diagnostics.closeAfterBusiness(() => app!.close())
        }
      } finally {
        if (supervisor.inspect().state === 'alive' || supervisor.inspect().state === 'starting') {
          if (supervisor.signalWorker('SIGKILL')) await supervisor.waitWorkerExit()
        }
        await server.close()
      }
    }, 45_000)
  }
})
