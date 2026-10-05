import { symbols } from '@deepseek-ai/cordis'
import { afterEach, expect, test, vi } from 'vitest'
import { holdDerivation } from './support/managed.ts'
import type { CredentialsService } from '@omne-harness-lite/account-identity'
import {
  EntryOpeningStopped,
  type EntryOpeningSignal,
} from '@omne-harness-lite/governance-center-entry'
import { boot } from '../src/index.ts'
import { startAssemblyWork } from '@omne-harness-lite/assembly-lifecycle/cordis'
import { DISTRIBUTION_IDS, replaceApply } from './support/tree.ts'
import { inspectPluginTree } from '@omne-harness-lite/cordis-plugin-tree/cordis'
import type { PluginTreeHandle } from '@omne-harness-lite/cordis-plugin-tree'
import { deployment, asEnv, query, LogCapture } from './support/deployment.ts'
import { Hosts, allDisposed } from './support/host.ts'
import {
  bodyOf,
  envelope,
  REGISTER,
  PUBLIC_HEALTH_BODY,
  tlsExchange,
  unixExchange,
} from './support/wire.ts'

const hosts = new Hosts()
afterEach(async () => {
  vi.restoreAllMocks()
  await hosts.stopAll()
})

test('withdrawing SQL stops both faces but retains the admitted scrypt result and first commit', async () => {
  const d = await deployment('managed-sql-late-derive')
  const { host } = await hosts.start(d)
  const opening: EntryOpeningSignal = host.context.entryOpening
  await opening.wait()
  const credentials = Reflect.get(host.context.credentials, symbols.original) as CredentialsService
  const held = holdDerivation(credentials)
  const request = tlsExchange(
    d.port,
    envelope(REGISTER, { loginIdentifier: 'late-managed', credential: 'correct horse battery' }),
    15_000,
  )
  let disposed = false
  try {
    await held.reached
    const withdrawing = Promise.resolve(host.fibers['storage-sql']!.dispose()).then(() => {
      disposed = true
    })
    // Cordis 4.0.4 schedules _unload effect callbacks at a microtask checkpoint.
    // This is the same checkpoint used by the adopted lifecycle probe; no I/O turn elapses.
    const atDisposeCall = opening.isOpen()
    await Promise.resolve()
    console.info('managed-stop-checkpoint', { atDisposeCall, afterMicrotask: opening.isOpen() })
    expect(opening.isOpen()).toBe(false)
    await expect(opening.wait()).rejects.toBeInstanceOf(EntryOpeningStopped)
    expect(disposed).toBe(false)
    const [client, ops] = await Promise.all([
      tlsExchange(d.port, PUBLIC_HEALTH_BODY, 3_000),
      unixExchange(d.socketPath, 3_000),
    ])
    expect(client.bytes.length).toBe(0)
    expect(ops.bytes.length).toBe(0)
    expect(disposed).toBe(false)
    held.release()
    // AR2 cannot hand off its next step after generation stop; the completed AI commit remains.
    expect(bodyOf(await request)).toEqual({ failure: 'interrupted' })
    await withdrawing
    expect(await hosts.stop(host)).toEqual({ complete: true, unfinished: [] })
    expect(
      query(d.file, "SELECT activated FROM account WHERE login_identifier = 'late-managed'"),
    ).toEqual([{ activated: 0 }])
    expect(query(d.file, 'SELECT * FROM organization')).toEqual([])
  } finally {
    held.release()
    await request
  }
})

test('stopping during confirmation cannot open either face with the old signal', async () => {
  const d = await deployment('managed-stop-before-confirm')
  const paused = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  let opening: EntryOpeningSignal | undefined
  let storage: import('@deepseek-ai/cordis').Fiber | undefined
  let tree: PluginTreeHandle | undefined
  const starting = boot({
    env: asEnv(d),
    log: new LogCapture(),
    hooks: {
      treeCreated(handle) {
        tree = handle
      },
      async beforeConfirm(context) {
        if (tree === undefined) throw new Error('tree unavailable')
        storage = inspectPluginTree(tree).find(row => row.id === 'storage-sql')?.fiber
        opening = context.entryOpening
        paused.resolve()
        await release.promise
      },
    },
  })
  void starting.catch(() => undefined)
  try {
    await paused.promise
    const waiting = opening!.wait()
    const rejected = expect(waiting).rejects.toBeInstanceOf(EntryOpeningStopped)
    const stopping = storage!.dispose()
    expect(opening!.isOpen()).toBe(false)
    await rejected
    release.resolve()
    await expect(starting).rejects.toMatchObject({ stage: 'plugin' })
    await stopping
    await expect(opening!.wait()).rejects.toBeInstanceOf(EntryOpeningStopped)
    const again = await hosts.start(d)
    expect(again.host.context.entryOpening.isOpen()).toBe(true)
    expect(opening!.isOpen()).toBe(false)
  } finally {
    release.resolve()
  }
})

test('withdrawing any managed provider ends the old generation and permits a fresh boot', async () => {
  const d = await deployment('managed-new-generation')
  const { host, log } = await hosts.start(d)
  const opening: EntryOpeningSignal = host.context.entryOpening
  await host.fibers['credential-verification']!.dispose()
  expect(opening.isOpen()).toBe(false)
  expect(await hosts.stop(host)).toEqual({ complete: true, unfinished: [] })
  expect(log.events('fiber-disposed').map(row => row['plugin'])).toEqual(
    [...DISTRIBUTION_IDS].reverse(),
  )
  const next = await hosts.start(d)
  expect(next.host.serving.centerId).toBe(host.serving.centerId)
  expect(next.host.context.entryOpening.isOpen()).toBe(true)
  await expect(opening.wait()).rejects.toBeInstanceOf(EntryOpeningStopped)
})

test('failed clock readiness retains the private cause and waits for real prefix cleanup', async () => {
  const d = await deployment('managed-failed-prefix')
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>()
  const original = new Error('prefix-private-regression-sentinel')
  let tree: PluginTreeHandle | undefined
  let settled = false
  const refusing = hosts.refuse(d, {
    treeCreated: handle => {
      tree = handle
    },
    resolveModule: replaceApply(
      '@omne-harness-lite/clock-lease',
      ctx => {
        startAssemblyWork(
          ctx,
          async () => {
            entered.resolve()
            throw original
          },
          async () => {
            await release.promise
            throw new Error('controlled prefix close rejection')
          },
        )
      },
      'managedClockPlugin',
    ),
  })
  void refusing.then(
    () => {
      settled = true
    },
    () => {
      settled = true
    },
  )
  try {
    await entered.promise
    if (tree === undefined) throw new Error('tree unavailable')
    await expect(tree.ready).rejects.toMatchObject({ code: 'apply-failed', rowId: 'clock-lease' })
    let closed = false
    void tree.closed.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(settled).toBe(false)
    expect(inspectPluginTree(tree).map(row => row.id)).toEqual(['storage-sql', 'clock-lease'])
    release.resolve()
    const refused = await refusing
    expect(refused.failure).toMatchObject({ stage: 'plugin', item: 'clock-lease' })
    expect(refused.failure.cause).toBe(original)
    expect(allDisposed(refused.fibers)).toBe(true)
    const report = await tree.closed
    expect(report.complete).toBe(false)
    expect(report.rows.find(row => row.id === 'clock-lease')?.result).toEqual({
      kind: 'failed',
      codes: ['setup', 'close'],
    })
    expect(refused.log.text()).not.toContain(original.message)
    expect(refused.log.text()).not.toContain(
      "Cannot read properties of undefined (reading 'catch')",
    )
  } finally {
    release.resolve()
    await refusing
  }
})
