import { installSqlControlFault, sqlRowBytes } from './sql-control-fault.ts'
import { readModelLogEnvelope } from '@omne-harness-lite/model-request-runtime'
import { deriveCreationKey } from '../src/call-references.ts'
import { createHash } from 'node:crypto'
import { fork, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, open, readFile, readdir, type FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
/** Explicit budget for one forked real-demo phase; see the cold-process case below. */
const CHILD_PHASE_BUDGET_MS = 90_000
const AT = '2026-09-28T00:00:00Z'

function user(label: string) {
  const judged = judgeMessage({
    type: 'user',
    id: `control-user-${label}`,
    createdAt: AT,
    blocks: [
      {
        id: `control-text-${label}`,
        kind: 'text',
        text: 'controlled control-writer fault',
        visibility: { toHuman: true, toModel: true },
      },
    ],
  })
  if (!('ok' in judged) || judged.ok.type !== 'user') throw new Error('invalid user fixture')
  return judged.ok
}

async function ready(label: string, onReceive?: () => Promise<void>) {
  const config = await callDeployment(label)
  if (config.sessionLog === undefined) throw new Error('actual SQL journal deployment missing')
  const tls = await createLocalTls(join(dirname(config.databaseFile), 'tls'), onReceive)
  const app = createAcceptanceApplication(config, {
    stage: 'modelRequest',
    developmentTransport: tls.developmentTransport,
    diagnostics: { record() {} },
  })
  const host = createDemoCallHost()
  await app.ready
  const who = await actor(app)
  const diagnostics = await activateModelFixture(app, who, config)
  const prepared = await app.prepareSession(who, `${label}-session`)
  if (!('session' in prepared)) throw new Error('session preparation failed')
  const session = prepared.session
  expect(await app.prepareModelInputs(who, session)).toEqual({ prepared: true })
  expect(await app.selectModel(who, session, MODEL)).toEqual({ selected: MODEL })
  expect(await app.attachModelCallHost(who, session, host)).toEqual({ attached: true })
  expect(
    await app.publishCredential(who, async checked => ({
      account: checked.account,
      tenant: checked.tenant,
      sourceRef: ref(`control-writer-${label}`),
      body: Buffer.from('controlled-control-credential'),
    })),
  ).toEqual({ stored: true })
  const bound = await app.bindModelRuntime(who, session)
  if (!('service' in bound)) throw new Error('runtime binding failed')
  const effective = await bound.service.effectiveModel({ session })
  if (!('effectiveModel' in effective)) throw new Error('effective model unavailable')
  return {
    app,
    tls,
    host,
    diagnostics,
    who,
    session,
    service: bound.service,
    basis: effective.effectiveModel,
    logRoot: config.databaseFile,
    probePath: config.databaseFile,
    async openCall(label: string) {
      const opened = await bound.service.openCall({
        creationKey: deriveCreationKey({ session, userMessage: label }),
        session,
        target: effective.effectiveModel.routeName,
        basis: effective.effectiveModel,
        messages: [user(label)],
        tools: [],
        parameters: { reasoningEffort: 'low', maxOutputTokens: 1024 },
        host: host.host,
      })
      if (!('callId' in opened) || opened.state !== 'open')
        throw new Error(`open rejected: ${JSON.stringify(opened)}`)
      return opened.callId
    },
  }
}

async function logBytes(file: string): Promise<string> {
  return sqlRowBytes(file)
}
function controlRows(serialized: string, callId: string, kind: string): readonly unknown[] {
  const rows: { value: string }[] = JSON.parse(serialized)
  return rows.flatMap(row => {
    const entry = JSON.parse(row.value) as { payload: unknown }
    const decoded = readModelLogEnvelope(entry.payload)
    if (!('kind' in decoded) || decoded.kind !== 'model' || decoded.envelope.category !== 'record')
      return []
    const value = decoded.envelope.value as { kind?: string; call?: string }
    return value.kind === kind && value.call === callId ? [value] : []
  })
}

function fileMethods(value: unknown): value is Pick<FileHandle, 'datasync' | 'truncate'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'datasync' in value &&
    typeof value.datasync === 'function' &&
    'truncate' in value &&
    typeof value.truncate === 'function'
  )
}

function childFixture(input: Record<string, unknown>): {
  readonly child: ChildProcess
  readonly messages: unknown[]
  readonly exited: Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>
  readonly closed: Promise<void>
} {
  const child = fork(new URL('./control-writer-uncertainty-fixture.mjs', import.meta.url), [], {
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    execArgv: [],
    env: { ...process.env, NODE_OPTIONS: '' },
  })
  const messages: unknown[] = []
  child.on('message', message => messages.push(message))
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => {
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  const closed = new Promise<void>(resolve => {
    child.once('close', () => resolve())
  })
  child.send(input)
  return { child, messages, exited, closed }
}

function childMessage(
  messages: readonly unknown[],
  kind: string,
): Record<string, unknown> | undefined {
  for (const message of messages) {
    if (typeof message !== 'object' || message === null || !('kind' in message)) continue
    if (message.kind === 'failure')
      throw new Error(`fixture failed: ${String('message' in message ? message.message : '')}`)
    if (message.kind === kind) return message
  }
  return undefined
}

async function controlSyncFault(file: string, lostReceipt: boolean) {
  return installSqlControlFault(
    file,
    lostReceipt ? 'lostReceipt' : 'beforeInsert',
    lostReceipt ? 'model_call_ended' : 'model_call_interrupt_intent',
  )
}

describe('unknown control writer on actual demo SQL', () => {
  it('retains a committed release record and its original owner while original recognition is unavailable', async () => {
    const fixture = await ready('control-release-unknown')
    const fault = await controlSyncFault(fixture.probePath, true)
    const { app, tls, host, diagnostics, who, session, service, logRoot } = fixture
    try {
      tls.setMode('http503')
      const callId = await fixture.openCall('release')
      expect(await service.dispatch({ session, callId })).toMatchObject({
        settled: { outcome: 'failed' },
      })
      expect(tls.requests).toHaveLength(1)
      const before = await logBytes(logRoot)
      fault.arm()
      expect(await service.releaseCall({ session, callId })).toEqual({ unavailable: true })
      expect(fault.counts().receiptFailures).toBeGreaterThan(0)
      expect(fault.counts().recognitionFailures).toBeGreaterThan(0)
      const written = await logBytes(logRoot)
      expect(controlRows(written, callId, 'model_call_ended')).toEqual([
        { kind: 'model_call_ended', call: callId, ending: 'released' },
      ])
      expect(written).not.toBe(before)
      expect(await service.releaseCall({ session, callId })).toEqual({ unavailable: true })
      expect(await host.stop()).toEqual({ unavailable: true })
      const blocked = await diagnostics.closeAfterBusiness(() => app.close())
      expect(blocked.complete).toBe(false)
      expect(tls.requests).toHaveLength(1)
      expect(await logBytes(logRoot)).toBe(written)

      fault.clear()
      const recovered = await diagnostics.closeAfterBusiness(() => app.close())
      // A positive complete SQL readback resolves this original. No second append is authorized.
      expect(recovered.complete).toBe(true)
      expect(
        createHash('sha256')
          .update(await logBytes(logRoot))
          .digest('hex'),
      ).toBe(createHash('sha256').update(written).digest('hex'))
      expect(tls.requests).toHaveLength(1)
    } finally {
      await fault.close()
      await diagnostics.closeAfterBusiness(() => app.close())
      await tls.close()
    }
  }, 45_000)

  // Each phase forks a fresh Node process that imports the built demo (Cordis, sharp, SQLite)
  // and opens a complete demo before it reports. On the shared host this measured 9.5-11 s for
  // the import alone and about 50 s for the whole case, so these budgets bound real process
  // start-up rather than the assertions below.
  it(
    'recognizes the exact release record only after actual old-process exit and successor full scan',
    async () => {
      const base = fileURLToPath(
        new URL('../../../tmp/model-request-runtime/control-writer-cold/', import.meta.url),
      )
      await mkdir(base, { recursive: true, mode: 0o700 })
      const root = await mkdtemp(join(base, 'release-'))
      const dataDirectory = join(root, 'data')
      const tls = await createLocalTls(join(root, 'tls'))
      tls.setMode('http503')
      const shared = {
        dataDirectory,
        baseUrl: tls.developmentTransport.baseUrl,
        ca: Buffer.from(tls.developmentTransport.tls.ca).toString('base64'),
      }
      const originalIdentity = 'control-release-original'
      const original = childFixture({ phase: 'original', identity: originalIdentity, ...shared })
      let successor: ReturnType<typeof childFixture> | undefined
      try {
        await vi.waitFor(() => expect(childMessage(original.messages, 'unknown')).toBeDefined(), {
          timeout: CHILD_PHASE_BUDGET_MS,
        })
        const unknown = childMessage(original.messages, 'unknown')
        if (typeof unknown?.callId !== 'string') throw new Error('original call identity absent')
        expect(unknown).toMatchObject({ commits: 1, receiptFailures: 1, recognitionFailures: 1 })
        expect(tls.requests).toHaveLength(1)
        const before = await logBytes(join(dataDirectory, 'db.sqlite'))
        expect(controlRows(before, unknown.callId, 'model_call_ended')).toEqual([
          { kind: 'model_call_ended', call: unknown.callId, ending: 'released' },
        ])
        expect(original.child.kill('SIGKILL')).toBe(true)
        expect(await original.exited).toEqual({ code: null, signal: 'SIGKILL' })
        await original.closed

        // Only the observed exit/close fact authorizes this test host's successor observer.
        successor = childFixture({
          phase: 'successor',
          identity: 'control-release-successor',
          previousOwner: originalIdentity,
          previousExitObserved: true,
          callId: unknown.callId,
          ...shared,
        })
        await vi.waitFor(
          () => expect(childMessage(successor?.messages ?? [], 'recovered')).toBeDefined(),
          {
            timeout: CHILD_PHASE_BUDGET_MS,
          },
        )
        expect(childMessage(successor.messages, 'recovered')).toMatchObject({
          endedCount: 1,
          ending: 'released',
          historyState: 'handed_up',
          closeComplete: true,
        })
        expect((await successor.exited).code).toBe(0)
        await successor.closed
        expect(await logBytes(join(dataDirectory, 'db.sqlite'))).toBe(before)
        expect(tls.requests).toHaveLength(1)
      } finally {
        if (original.child.exitCode === null && original.child.signalCode === null) {
          original.child.kill('SIGKILL')
          await original.closed
        }
        if (
          successor !== undefined &&
          successor.child.exitCode === null &&
          successor.child.signalCode === null
        ) {
          successor.child.kill('SIGKILL')
          await successor.closed
        }
        await tls.close()
      }
    },
    2 * CHILD_PHASE_BUDGET_MS + 30_000,
  )

  it('does not abort an in-flight send when its interrupt intent is known uncommitted', async () => {
    const entered = deferred(),
      release = deferred()
    const fixture = await ready('control-interrupt-absent', async () => {
      entered.resolve()
      await release.promise
    })
    const fault = await controlSyncFault(fixture.probePath, false)
    const { app, tls, host, diagnostics, session, service, logRoot } = fixture
    let sendSettled = false
    try {
      const callId = await fixture.openCall('interrupt')
      const sending = service.dispatch({ session, callId })
      void sending.then(
        () => {
          sendSettled = true
        },
        () => {
          sendSettled = true
        },
      )
      await entered.promise
      expect(tls.requests).toHaveLength(1)
      fault.arm()
      expect(await service.interrupt({ session, callId, initiator: 'user' })).toEqual({
        unavailable: true,
      })
      expect(fault.counts().receiptFailures).toBe(0)
      expect(fault.counts().recognitionFailures).toBe(0)
      expect(fault.counts().writeFailures).toBe(1)
      expect(fault.counts().commits).toBe(0)
      expect(
        controlRows(await logBytes(logRoot), callId, 'model_call_interrupt_intent'),
      ).toHaveLength(0)
      expect(tls.closedSockets()).toBe(0)
      fault.clear()
      release.resolve()
      await expect.poll(() => sendSettled, { timeout: 3_000 }).toBe(true)
      expect(await sending).toMatchObject({ replyPending: { outcome: 'complete' } })
      expect(tls.requests).toHaveLength(1)
      expect(await host.stop()).toEqual({ released: true })
      expect((await diagnostics.closeAfterBusiness(() => app.close())).complete).toBe(true)
    } finally {
      fault.clear()
      release.resolve()
      await fault.close()
      // The failing counterexample still owns its active dispatch. The isolated
      // Vitest worker is its process boundary; awaiting close would hide the failure.
      if (sendSettled) {
        await host.stop()
        await diagnostics.closeAfterBusiness(() => app.close())
        await tls.close()
      }
    }
  }, 45_000)
})
