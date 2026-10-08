import { DatabaseSync } from 'node:sqlite'
// @module-tag slow -- uses an actual child writer and process-exit recovery authority.
import { fork } from 'node:child_process'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openSqlLogFixture } from './sql-log-fixture.ts'
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
    sessionLog: { operationLimit: 32 },
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
  const corrupted = await initial.prepareSession(user, 'b-corrupt')
  if (!('session' in corrupted)) throw new Error('Session preparation failed')
  expect((await initial.close()).complete).toBe(true)
  if (!config.sessionLog) throw new Error('log config missing')
  const log = await openSqlLogFixture({ file: config.databaseFile })
  expect(
    await log.append(
      corrupted.session,
      [{ tenant: user.tenant, readKeys: [], payload: 'will-corrupt' }],
      { kind: 'unfenced' },
      { kind: 'unconditional' },
    ),
  ).toHaveProperty('tail', 1)
  await log.close()
  const db = new DatabaseSync(config.databaseFile)
  expect(
    db.prepare("update sl_entry set value = '{malformed' where session = 'b-corrupt'").run()
      .changes,
  ).toBeGreaterThan(0)
  db.close()
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
  const original = await openSqlLogFixture({ file: config.databaseFile })
  await original.append(
    older.session,
    [{ tenant: user.tenant, readKeys: [], payload: 'older session' }],
    { kind: 'unfenced' },
    { kind: 'unconditional' },
  )
  await original.close()
  const child = fork(
    fileURLToPath(new URL('./session-catalog-partial-fixture.mjs', import.meta.url)),
    [config.databaseFile, prepared.session, JSON.stringify(prepared.tenant)],
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
      sessionLog: { operationLimit: 32 },
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
