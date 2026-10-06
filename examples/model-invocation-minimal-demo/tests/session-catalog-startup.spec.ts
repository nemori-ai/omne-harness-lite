// @module-tag slow -- uses an actual child writer and process-exit recovery authority.
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openJsonlSessionLog } from '@omne-harness-lite/session-log-jsonl'
import { expect, it } from 'vitest'
import { createAcceptanceApplication } from '../src/bootstrap.ts'
import type { AcceptanceConfig, AcceptanceHooks } from '../src/types.ts'
import { actor, deployment, latch } from './support.ts'

async function configuration(label: string): Promise<AcceptanceConfig> {
  const config = await deployment(label)
  const dir = join(dirname(config.databaseFile), 'logs')
  await mkdir(dir, { mode: 0o700 })
  return {
    ...config,
    sessionLog: {
      dir,
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
      processOwnership: { current: label, observeExit: async () => 'unknown' },
    },
  }
}
function app(config: AcceptanceConfig, hooks?: AcceptanceHooks) {
  return createAcceptanceApplication(config, {
    stage: 'sessionLog',
    diagnostics: { record() {} },
    ...(hooks ? { hooks } : {}),
  })
}
it('keeps creation and binding closed until startup has checked the held catalog', async () => {
  const config = await configuration('catalog-gate')
  const initial = app(config)
  await initial.ready
  const user = await actor(initial)
  await initial.prepareSession(user, 'registered')
  expect((await initial.close()).complete).toBe(true)
  const entered = latch(),
    gate = latch()
  const resumed = app(config, {
    async fiberCreated(name, fiber) {
      if (name === 'sessionAccess') {
        await fiber
        entered.resolve()
        await gate.promise
      }
    },
  })
  try {
    await entered.promise
    expect(await resumed.prepareSession(user, 'during-scan')).toEqual({ failure: 'stageClosed' })
    expect(await resumed.bindToolSession(user, 'registered')).toMatchObject({
      reason: 'ownerStopped',
    })
    gate.resolve()
    await resumed.ready
    expect(await resumed.prepareSession(user, 'after-scan')).toHaveProperty('session', 'after-scan')
  } finally {
    gate.resolve()
    expect((await resumed.close()).complete).toBe(true)
  }
})

it('does not open admission if one held prefix cannot be recovered after another succeeds', async () => {
  const config = await configuration('catalog-partial-ready')
  const initial = app(config)
  await initial.ready
  const user = await actor(initial)
  await initial.prepareSession(user, 'a-empty')
  await initial.prepareSession(user, 'b-corrupt')
  expect((await initial.close()).complete).toBe(true)
  if (!config.sessionLog) throw new Error('log config missing')
  const bad = join(config.sessionLog.dir, createHash('sha256').update('b-corrupt').digest('hex'))
  await mkdir(bad, { mode: 0o700 })
  await writeFile(join(bad, 'recovery.json'), '{malformed', { mode: 0o600 })
  const resumed = app(config)
  await expect(resumed.ready).rejects.toThrow()
  expect(await resumed.prepareSession(user, 'must-not-open')).toEqual({ failure: 'stageClosed' })
  expect((await resumed.close()).complete).toBe(true)
})

it('finds a seeded session with an interrupted first commit after actual writer exit, without any observer', async () => {
  const config = await configuration('catalog-interrupted-first')
  const initial = app(config)
  await initial.ready
  const user = await actor(initial)
  const prepared = await initial.prepareSession(user, 'b-first-write')
  const older = await initial.prepareSession(user, 'a-already-present')
  if (!('session' in prepared) || !('session' in older) || !config.sessionLog)
    throw new Error('seed missing')
  expect((await initial.close()).complete).toBe(true)
  // Existing session and interrupted new session must both be scanned at the next startup.
  const original = await openJsonlSessionLog(config.sessionLog)
  await original.append(
    older.session,
    [{ tenant: user.tenant, readKeys: [], payload: 'older session' }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  await original.close()
  const child = fork(
    fileURLToPath(new URL('./session-catalog-partial-fixture.mjs', import.meta.url)),
    [config.sessionLog.dir, prepared.session, JSON.stringify(prepared.tenant)],
    { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] },
  )
  let errorText = ''
  child.stderr?.on('data', data => {
    errorText += String(data)
  })
  const exited = once(child, 'exit')
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`partial fixture timeout: ${errorText}`)),
        20000,
      )
      child.once('message', value => {
        clearTimeout(timeout)
        value === 'partial-written' ? resolve() : reject(new Error('unexpected child message'))
      })
      child.once('exit', () => {
        clearTimeout(timeout)
        reject(new Error(`partial child exited before signal: ${errorText}`))
      })
    })
    expect(child.kill('SIGKILL')).toBe(true)
    const [, signal] = await exited
    expect(signal).toBe('SIGKILL')
    const resumed = app({
      ...config,
      sessionLog: {
        ...config.sessionLog,
        processOwnership: {
          current: 'catalog-successor',
          observeExit: async owner =>
            owner === 'catalog-partial-child' && child.signalCode === 'SIGKILL'
              ? 'exited'
              : 'unknown',
        },
      },
    })
    try {
      await resumed.ready
      expect(await resumed.readSessionLog(user, 'b-first-write')).toMatchObject({
        tail: 0,
        entries: [],
      })
      expect(await resumed.readSessionLog(user, 'a-already-present')).toMatchObject({
        tail: 1,
        entries: [{ payload: 'older session' }],
      })
    } finally {
      expect((await resumed.close()).complete).toBe(true)
    }
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
  }
})
