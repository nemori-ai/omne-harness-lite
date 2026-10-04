import fs from 'node:fs/promises'
import type { Fiber } from '@deepseek-ai/cordis'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGINS_SERVICE, type LoginsService } from '@omne-harness-lite/account-identity'
import { openJsonlSessionLog, type SessionLog } from '@omne-harness-lite/session-log-jsonl'
import { createSessionTenancyReader } from '@omne-harness-lite/session-tenancy-table'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { FIBER_STATE } from '@omne-harness-lite/kernel-basis/cordis'
import {
  MEMBERSHIPS_SERVICE,
  OFFERS_SERVICE,
  ORGANIZATIONS_SERVICE,
} from '@omne-harness-lite/organization-governance/cordis'
import {
  type MembershipsService,
  type OffersService,
  type OrganizationsService,
} from '@omne-harness-lite/organization-governance'
import { StorageUnavailable } from '@omne-harness-lite/storage'
import {
  createAcceptanceApplication,
  SESSION_LOG_FIBERS,
  type AcceptanceEvent,
  type AcceptanceConfig,
  type SessionLogDeployment,
  type AcceptanceHooks,
} from '../src/index.ts'
import { actor, deployment, latch } from './support.ts'

function session(value: string) {
  const parsed = parseOpaqueIdentifier(value, 'SessionRef')
  if (!isOk(parsed)) throw new Error('invalid fixture SessionRef')
  return parsed.ok
}
async function logDeployment(
  label: string,
): Promise<AcceptanceConfig & { readonly sessionLog: SessionLogDeployment }> {
  const base = await deployment(label)
  const dir = join(dirname(base.databaseFile), 'logs')
  await fs.mkdir(dir, { mode: 0o700 })
  return {
    ...base,
    sessionLog: {
      dir,
      policy: { appendQueueLimit: 8, residentLogsLimit: 16 },
      processOwnership: {
        current: label,
        async observeExit() {
          return 'unknown' as const
        },
      },
    },
  }
}
function logFace(value: unknown): value is SessionLog {
  return (
    typeof value === 'object' &&
    value !== null &&
    'readSince' in value &&
    typeof value.readSince === 'function' &&
    'readByKey' in value &&
    typeof value.readByKey === 'function' &&
    'append' in value &&
    typeof value.append === 'function'
  )
}
function loginFace(value: unknown): value is Pick<LoginsService, 'revoke'> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'revoke' in value &&
    typeof value.revoke === 'function'
  )
}
function start(
  config: Awaited<ReturnType<typeof logDeployment>>,
  hooks?: AcceptanceHooks,
  events: AcceptanceEvent[] = [],
) {
  return createAcceptanceApplication(config, {
    stage: 'sessionLog',
    diagnostics: { record: e => events.push(e) },
    ...(hooks === undefined ? {} : { hooks }),
  })
}

describe('A2a real JSONL owner and authorization', () => {
  it('opens the exact ten-fiber gate and reads complete committed rows after actual close/reopen', async () => {
    const config = await logDeployment('log-reopen'),
      events: AcceptanceEvent[] = []
    let log: SessionLog | undefined
    const app = start(
      config,
      {
        beforeConfirm() {
          expect(Object.keys(app.status().fibers)).toHaveLength(6)
        },
        async fiberCreated(name, fiber) {
          if (name !== 'sessionLog') return
          await fiber
          const value: unknown = fiber.ctx.get('sessionLog')
          if (!logFace(value)) throw new Error('real session log contribution absent')
          log = value
          expect(Object.keys(value)).toEqual(['append', 'readByKey', 'readSince'])
        },
      },
      events,
    )
    await app.ready
    try {
      expect(Object.isFrozen(SESSION_LOG_FIBERS)).toBe(true)
      expect(Object.keys(app.status().fibers)).toEqual([...SESSION_LOG_FIBERS])
      expect(Object.values(app.status().fibers)).toEqual(Array(10).fill(FIBER_STATE.ACTIVE))
      const who = await actor(app)
      expect(await app.prepareSession(who, 's1')).toEqual({ session: 's1', tenant: who.tenant })
      if (log === undefined) throw new Error('real log absent')
      const payload = {
        kind: 'application-test',
        complete: { array: [1, 'two', true], nested: { text: 'durable' } },
      }
      expect(
        await log.append(
          session('s1'),
          [
            {
              tenant: who.tenant,
              dedupeKey: 'log-fixture/1',
              readKeys: ['log-fixture/1'],
              payload,
            },
          ],
          { kind: 'unfenced' },
          { kind: 'unconditional' },
        ),
      ).toEqual({ positions: [1], tail: 1 })
      const before = await app.readSessionLog(who, 's1')
      expect(before).toEqual({
        entries: [
          {
            session: 's1',
            position: 1,
            tenant: who.tenant,
            dedupeKey: 'log-fixture/1',
            readKeys: ['log-fixture/1'],
            payload,
          },
        ],
        tail: 1,
      })
      await expect(openJsonlSessionLog(config.sessionLog)).rejects.toThrow()
      expect((await app.close()).complete).toBe(true)
      expect(await app.readSessionLog(who, 's1')).toEqual({ failure: 'stageClosed' })
      const ownerClosed = events.findIndex(
        e => e.event === 'close' && e.phase === 'sessionLogOwner' && e.outcome === 'closed',
      )
      expect(ownerClosed).toBeGreaterThan(-1)
      expect(
        events.findIndex(e => e.event === 'close' && e.phase === 'sessionLog'),
      ).toBeGreaterThan(ownerClosed)
      expect(
        events.findIndex(e => e.event === 'close' && e.phase === 'sessionTenancy'),
      ).toBeGreaterThan(ownerClosed)
      const next = start(config)
      try {
        await next.ready
        expect(await next.readSessionLog(who, 's1')).toEqual(before)
      } finally {
        expect((await next.close()).complete).toBe(true)
      }
      const owner = await openJsonlSessionLog(config.sessionLog)
      try {
        expect(await owner.readSince(session('s1'), 0)).toEqual(before)
      } finally {
        await owner.close()
      }
    } finally {
      await app.close()
    }
  })

  it('rechecks actual login and tenant, rejects missing mapping without seeding, and validates SessionRef', async () => {
    const config = await logDeployment('log-auth')
    let reader: ReturnType<typeof createSessionTenancyReader> | undefined,
      login: Pick<LoginsService, 'revoke'> | undefined
    const app = start(config, {
      storageOpened(storage) {
        reader = createSessionTenancyReader(storage)
      },
      async fiberCreated(name, fiber) {
        if (name === 'accountIdentity') {
          await fiber
          const value: unknown = fiber.ctx.get(LOGINS_SERVICE)
          if (!loginFace(value)) throw new Error('actual logins absent')
          login = value
        }
      },
    })
    try {
      await app.ready
      const alice = await actor(app),
        bob = await actor(app, 'bob')
      await app.prepareSession(alice, 's1')
      expect(await app.readSessionLog(bob, 's1')).toEqual({ failure: 'identityMismatch' })
      expect(await app.readSessionLog({ ...alice, account: bob.account }, 's1')).toEqual({
        failure: 'identityMismatch',
      })
      expect(await app.readSessionLog({ ...alice, tenant: bob.tenant }, 's1')).toEqual({
        failure: 'identityMismatch',
      })
      expect(await app.readSessionLog(alice, 'missing')).toEqual({
        step: 'holdingTenant',
        result: { failure: 'sessionNotFound' },
      })
      expect(await reader?.holdingTenant('missing')).toEqual({ failure: 'sessionNotFound' })
      expect(await app.readSessionLog(alice, {})).toEqual({
        step: 'holdingTenant',
        result: { failure: 'invalidInput' },
      })
      if (login === undefined) throw new Error('actual login revoke absent')
      await login.revoke(alice.loginState, alice.loginState)
      expect(await app.readSessionLog(alice, 's1')).toMatchObject({
        step: 'verify',
        result: { failure: 'login-state-rejected' },
      })
    } finally {
      await reader?.close()
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('rechecks effective standing before each real log read', async () => {
    let governanceFiber: Fiber | undefined
    let reader: ReturnType<typeof createSessionTenancyReader> | undefined
    const app = start(await logDeployment('log-standing'), {
      fiberCreated(name, fiber) {
        if (name === 'governance') governanceFiber = fiber
      },
      storageOpened(storage) {
        reader = createSessionTenancyReader(storage)
      },
    })
    function organizationsFace(value: unknown): value is Pick<OrganizationsService, 'createTeam'> {
      return (
        typeof value === 'object' &&
        value !== null &&
        'createTeam' in value &&
        typeof value.createTeam === 'function'
      )
    }
    function offersFace(
      value: unknown,
    ): value is Pick<OffersService, 'issueInvitation' | 'acceptInvitation'> {
      return (
        typeof value === 'object' &&
        value !== null &&
        'issueInvitation' in value &&
        typeof value.issueInvitation === 'function' &&
        'acceptInvitation' in value &&
        typeof value.acceptInvitation === 'function'
      )
    }
    function membershipsFace(
      value: unknown,
    ): value is Pick<MembershipsService, 'switchCurrentTenant' | 'remove'> {
      return (
        typeof value === 'object' &&
        value !== null &&
        'switchCurrentTenant' in value &&
        typeof value.switchCurrentTenant === 'function' &&
        'remove' in value &&
        typeof value.remove === 'function'
      )
    }
    try {
      await app.ready
      const alice = await actor(app),
        bob = await actor(app, 'bob')
      if (governanceFiber === undefined) throw new Error('governance not captured')
      const organizations: unknown = governanceFiber.ctx.get(ORGANIZATIONS_SERVICE),
        offers: unknown = governanceFiber.ctx.get(OFFERS_SERVICE),
        memberships: unknown = governanceFiber.ctx.get(MEMBERSHIPS_SERVICE)
      if (!organizationsFace(organizations) || !offersFace(offers) || !membershipsFace(memberships))
        throw new Error('actual governance mapping invalid')
      const team = await organizations.createTeam(alice.account, 'standing-team')
      if (!('ok' in team)) throw new Error('team creation rejected')
      const invite = await offers.issueInvitation(team.ok.tenant, bob.account, 'member')
      if (!('ok' in invite)) throw new Error('invitation rejected')
      const accepted = await offers.acceptInvitation(bob.account, invite.ok)
      if (!('ok' in accepted)) throw new Error('acceptance rejected')
      expect(await memberships.switchCurrentTenant(bob.loginState, accepted.ok)).toBe('ok')
      const selected = { ...bob, tenant: accepted.ok }
      expect(await app.readSessionLog(selected, 'before-removal')).toEqual({
        step: 'holdingTenant',
        result: { failure: 'sessionNotFound' },
      })
      expect(await app.prepareSession(selected, 'before-removal')).toEqual({
        session: 'before-removal',
        tenant: accepted.ok,
      })
      expect(await app.readSessionLog(selected, 'before-removal')).toEqual({ entries: [], tail: 0 })
      expect(await memberships.remove(team.ok.tenant, accepted.ok)).toBe('ok')
      expect(await app.readSessionLog(selected, 'before-removal')).toEqual({
        failure: 'membershipNotEffective',
      })
      expect(await app.prepareSession(selected, 'after-removal')).toEqual({
        failure: 'membershipNotEffective',
      })
      expect(await reader?.holdingTenant('after-removal')).toEqual({ failure: 'sessionNotFound' })
      expect(await reader?.holdingTenant('before-removal')).toEqual({ tenant: accepted.ok })
    } finally {
      await reader?.close()
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('preserves true holdingTenant unavailable and drains admitted reads before closing the owner', async () => {
    const config = await logDeployment('log-drain'),
      entered = latch(),
      release = latch(),
      events: AcceptanceEvent[] = []
    let block = false,
      denied = false
    const app = start(
      config,
      {
        storageOpened(storage) {
          const read = storage.read.bind(storage)
          storage.read = async callback => {
            const result = await read(callback)
            if (
              typeof result === 'object' &&
              result !== null &&
              ('tenant' in result || ('failure' in result && result.failure === 'sessionNotFound'))
            ) {
              if (denied) throw new StorageUnavailable('controlled holdingTenant read failure')
              if (block) {
                entered.resolve()
                await release.promise
              }
            }
            return result
          }
        },
      },
      events,
    )
    await app.ready
    const who = await actor(app)
    await app.prepareSession(who, 's1')
    denied = true
    expect(await app.readSessionLog(who, 's1')).toMatchObject({
      step: 'holdingTenant',
      result: { failure: 'unavailable' },
    })
    denied = false
    block = true
    const read = app.readSessionLog(who, 's1')
    await entered.promise
    const close = app.close()
    expect(app.close()).toBe(close)
    expect(app.status().inFlight).toBe(1)
    expect(await app.readSessionLog(who, 's1')).toEqual({ failure: 'stageClosed' })
    expect(events.some(e => e.event === 'close' && e.phase === 'sessionLogOwner')).toBe(false)
    block = false
    release.resolve()
    expect(await read).toEqual({ entries: [], tail: 0 })
    expect((await close).complete).toBe(true)
  })

  for (const state of ['failed'] as const)
    it(`never opens admission with the actual log contribution ${state}`, async () => {
      const config = await logDeployment(`log-${state}`)
      const app = start(config, {
        async fiberCreated(name, fiber) {
          if (name !== 'sessionLog') return
          await fiber
          const remove = fiber.ctx.root.on(
            'internal/config',
            function (_config, next) {
              if (this.uid === fiber.uid) throw new Error('controlled failed log contribution')
              return next()
            },
            { global: true },
          )
          await fiber.restart().catch(() => undefined)
          remove()
        },
      })
      await expect(app.ready).rejects.toMatchObject({ phase: 'sessionLog', category: state })
      expect(app.status().serving).toBe(false)
      expect((await app.close()).complete).toBe(true)
      const reopened = await openJsonlSessionLog(config.sessionLog)
      await reopened.close()
    })

  it('keeps the whole fixed gate when real STT dependencies become pending', async () => {
    const config = await logDeployment('log-pending')
    let storageFiber: Fiber | undefined, tenancyFiber: Fiber | undefined
    const app = start(config, {
      fiberCreated(name, fiber) {
        if (name === 'storage') storageFiber = fiber
        if (name === 'sessionTenancy') tenancyFiber = fiber
      },
    })
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      if (storageFiber === undefined || tenancyFiber === undefined)
        throw new Error('real dependencies absent')
      await storageFiber.dispose()
      await tenancyFiber.await()
      expect(tenancyFiber.state).toBe(FIBER_STATE.PENDING)
      expect(app.status().fibers.sessionLog).toBe(FIBER_STATE.ACTIVE)
      expect(await app.readSessionLog(who, 's1')).toEqual({ failure: 'stageClosed' })
    } finally {
      expect((await app.close()).complete).toBe(true)
    }
  })

  it('refuses competing physical ownership without discarding committed SQL state', async () => {
    const config = await logDeployment('log-exclusive'),
      owner = await openJsonlSessionLog(config.sessionLog)
    try {
      const app = start(config)
      await expect(app.ready).rejects.toMatchObject({ phase: 'sessionLog', category: 'failed' })
      expect((await app.close()).complete).toBe(true)
    } finally {
      await owner.close()
    }
    const next = start(config)
    try {
      await next.ready
      expect(next.status().serving).toBe(true)
    } finally {
      await next.close()
    }
  })

  it('reports unavailable rather than empty when the real root disappears; failing diagnostics remain independent', async () => {
    const config = await logDeployment('log-unavailable'),
      seen: AcceptanceEvent[] = []
    let failures = 0
    const app = createAcceptanceApplication(config, {
      stage: 'sessionLog',
      diagnostics: {
        record(e) {
          seen.push(e)
          failures++
          throw new Error('secret-cause-sentinel')
        },
      },
    })
    try {
      await app.ready
      const who = await actor(app)
      await app.prepareSession(who, 's1')
      expect(await app.readSessionLog(who, 's1')).toEqual({ entries: [], tail: 0 })
      await fs.rename(config.sessionLog.dir, `${config.sessionLog.dir}-moved`)
      expect(await app.readSessionLog(who, 's1')).toEqual({ failure: 'unavailable' })
      await fs.rename(`${config.sessionLog.dir}-moved`, config.sessionLog.dir)
      expect((await app.close()).complete).toBe(true)
      expect(app.status().diagnosticFailures).toBe(failures)
      expect(seen.some(e => e.event === 'sessionLog' && e.phase === 'root')).toBe(true)
      expect(JSON.stringify(seen)).not.toContain('secret-cause-sentinel')
    } finally {
      await app.close()
    }
  })

  it('keeps the actual owner and all dependencies when filesystem cleanup fails, then recovers after that owner exits', async () => {
    const config = await logDeployment('log-close-failure')
    const input = join(dirname(config.databaseFile), 'log-close-input.json')
    await fs.writeFile(
      input,
      JSON.stringify({
        ...config,
        wait: { clockTimeoutMs: config.wait.clockTimeoutMs, pollMs: config.wait.pollMs },
      }),
      { mode: 0o600 },
    )
    const child = spawn(
      process.execPath,
      [fileURLToPath(new URL('./session-log-close-fixture.mjs', import.meta.url)), input],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = '',
      stderr = ''
    child.stdout.on('data', value => {
      stdout += String(value)
    })
    child.stderr.on('data', value => {
      stderr += String(value)
    })
    const exit = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('close', code => resolve(code))
    })
    expect(exit, stderr).toBe(0)
    const result = JSON.parse(stdout)
    expect(result.closed.complete).toBe(false)
    expect(result.closed.unfinished.slice(0, 3)).toEqual([
      'sessionLogOwner',
      'sessionLog',
      'sessionTenancy',
    ])
    expect(result.retainedLock).toBe(true)
    expect(result.status.fibers.sessionLog).toBe(FIBER_STATE.ACTIVE)
    expect(result.status.fibers.storage).toBe(FIBER_STATE.ACTIVE)
    expect(
      result.events.some(
        (e: AcceptanceEvent) =>
          e.event === 'close' && e.phase === 'sessionLog' && e.outcome === 'closed',
      ),
    ).toBe(false)
    // The child close event is evidence of its actual exit, not a fabricated PID assertion.
    const reopened = start({
      ...config,
      sessionLog: {
        ...config.sessionLog,
        processOwnership: {
          current: 'log-close-parent',
          async observeExit(owner: string) {
            return owner === 'log-close-child' ? ('exited' as const) : ('unknown' as const)
          },
        },
      },
    })
    try {
      await reopened.ready
      expect(await reopened.readSessionLog(result.actor, 'close-session')).toEqual(result.original)
    } finally {
      expect((await reopened.close()).complete).toBe(true)
    }
  })

  it('requires complete explicit log deployment and preserves the old stages', async () => {
    const config = await deployment('log-config')
    const invalid = createAcceptanceApplication(config, {
      stage: 'sessionLog',
      diagnostics: { record() {} },
    })
    await expect(invalid.ready).rejects.toMatchObject({
      phase: 'prepare',
      category: 'configuration',
    })
    expect((await invalid.close()).complete).toBe(true)
    const app = createAcceptanceApplication(config, { diagnostics: { record() {} } })
    try {
      await app.ready
      const who = await actor(app)
      expect(await app.readSessionLog(who, 's1')).toEqual({ failure: 'stageClosed' })
      expect(Object.keys(app.status().fibers)).toHaveLength(8)
    } finally {
      await app.close()
    }
  })
})
