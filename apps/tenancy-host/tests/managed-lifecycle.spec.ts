import { symbols } from '@deepseek-ai/cordis'
import { afterEach, expect, test, vi } from 'vitest'
import { holdDerivation } from './support/managed.ts'
import type { CredentialsService } from '@omne-harness-lite/account-identity'
import {
  EntryOpeningStopped,
  type EntryOpeningSignal,
} from '@omne-harness-lite/governance-center-entry'
import { boot, HOST_PLUGIN_NAMES } from '../src/index.ts'
import { deployment, asEnv, query, LogCapture } from './support/deployment.ts'
import { Hosts } from './support/host.ts'
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
  const starting = boot({
    env: asEnv(d),
    log: new LogCapture(),
    hooks: {
      observeFiber(name, fiber) {
        if (name === 'storage-sql') storage = fiber
      },
      async beforeConfirm(context) {
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
    [...HOST_PLUGIN_NAMES].reverse(),
  )
  const next = await hosts.start(d)
  expect(next.host.serving.centerId).toBe(host.serving.centerId)
  expect(next.host.context.entryOpening.isOpen()).toBe(true)
  await expect(opening.wait()).rejects.toBeInstanceOf(EntryOpeningStopped)
})
