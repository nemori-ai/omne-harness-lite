import { createHash } from 'node:crypto'
import { open, readFile, readdir, type FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { judgeMessage } from '@omne-harness-lite/messages'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import { createDemoCallHost } from '../src/model-call-host.ts'
import { callDeployment } from './model-request-support.ts'
import { createLocalTls, deferred } from './local-tls.ts'
import { activateModelFixture, actor, ref } from './support.ts'

const MODEL = 'deepseek/deepseek-v4-pro-0813'
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
  if (config.sessionLog === undefined) throw new Error('actual JSONL deployment missing')
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
    logRoot: config.sessionLog.dir,
    probePath: join(dirname(config.databaseFile), 'control-writer-probe'),
    async openCall(label: string) {
      const opened = await bound.service.openCall({
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

async function logBytes(root: string): Promise<string> {
  const files = (await readdir(root, { recursive: true })).filter(path =>
    path.endsWith('entries.jsonl'),
  )
  return (await Promise.all(files.map(path => readFile(join(root, path), 'utf8')))).join('')
}

function controlRows(serialized: string, callId: string, kind: string): readonly unknown[] {
  const rows: unknown[] = []
  for (const line of serialized.split('\n').filter(Boolean)) {
    const batch: unknown = JSON.parse(line)
    if (
      typeof batch !== 'object' ||
      batch === null ||
      !('entries' in batch) ||
      !Array.isArray(batch.entries)
    )
      throw new Error('invalid actual JSONL batch')
    for (const entry of batch.entries) {
      if (typeof entry !== 'object' || entry === null || !('payload' in entry))
        throw new Error('invalid actual JSONL entry')
      const payload: unknown = entry.payload
      if (typeof payload !== 'object' || payload === null || !('value' in payload)) continue
      const value: unknown = payload.value
      if (typeof value !== 'object' || value === null || !('kind' in value) || !('call' in value))
        continue
      if (value.kind === kind && value.call === callId) rows.push(value)
    }
  }
  return rows
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

/** Real JSONL write succeeds; the commit receipt and repair are controlled independently. */
async function controlSyncFault(probePath: string, repairFails: boolean) {
  const probe = await open(probePath, 'w')
  const prototype: unknown = Object.getPrototypeOf(probe)
  if (!fileMethods(prototype)) throw new Error('actual file methods unavailable')
  const datasync = prototype.datasync
  const truncate = prototype.truncate
  let armed = false
  let syncFailures = 0
  let repairFailures = 0
  const fault = () =>
    Object.assign(new Error('controlled control append I/O fault'), { code: 'EIO' })
  const syncSpy = vi.spyOn(prototype, 'datasync').mockImplementation(async function (
    this: FileHandle,
  ) {
    if (armed) {
      syncFailures++
      throw fault()
    }
    await datasync.call(this)
  })
  const truncateSpy = vi.spyOn(prototype, 'truncate').mockImplementation(async function (
    this: FileHandle,
    size?: number,
  ) {
    if (armed && repairFails) {
      repairFailures++
      throw fault()
    }
    await truncate.call(this, size)
  })
  return {
    arm() {
      armed = true
    },
    clear() {
      armed = false
    },
    counts() {
      return { syncFailures, repairFailures }
    },
    async close() {
      armed = false
      syncSpy.mockRestore()
      truncateSpy.mockRestore()
      await probe.close()
    },
  }
}

describe('unknown control writer on actual demo JSONL', () => {
  it('retains a committed release record and its original owner through persistent repair EIO', async () => {
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
      expect(fault.counts().syncFailures).toBeGreaterThan(0)
      expect(fault.counts().repairFailures).toBeGreaterThan(0)
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
      expect(fault.counts().syncFailures).toBeGreaterThan(0)
      expect(fault.counts().repairFailures).toBe(0)
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
