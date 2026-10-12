import { ClientFace } from '../src/transport/client-face.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AccountsService } from '@omne-harness-lite/account-identity'
import type {
  OrganizationsService,
  MembershipsService,
} from '@omne-harness-lite/organization-governance'
import { StorageDefect, StorageUnavailable } from '@omne-harness-lite/storage'
import { parseLoginStateId, isOk } from '@omne-harness-lite/identity-values'
import {
  bootCenter,
  bodyOf,
  envelopeOf,
  registerAndLogin,
  PASSWORD,
  LOGIN,
  LIST_LOGINS,
  OG,
  gate,
  type Center,
  type Session,
} from './support/composition.ts'
import { httpRequest, tlsExchange } from './support/wire.ts'

const CHANGE = 'capability.account-identity/v3#S-50'
const INVITE = 'composition.governance-center-entry/v2#S-50'
const centers: Center[] = []
afterEach(async () => {
  for (const c of centers.splice(0)) await c.dispose()
})

async function fixture(drainTimeoutMs = 2_000) {
  const c = await bootCenter({ drainTimeoutMs })
  centers.push(c)
  await c.open()
  const session = await registerAndLogin(c, 'owner@example.invalid')
  return { c, session }
}

function value(reply: unknown): unknown {
  if (typeof reply !== 'object' || reply === null || !('result' in reply))
    throw new Error('expected result')
  return reply.result
}

async function request(
  c: Center,
  s: Session,
  operation: string,
  payload: Record<string, unknown> = {},
) {
  return bodyOf(await c.call(envelopeOf(operation, payload, s.presentation)))
}

async function activity(c: Center, s: Session) {
  return c.raw.read(tx =>
    tx.db
      .selectFrom('login_state')
      .selectAll()
      .where('login_state_id', '=', s.handle)
      .executeTakeFirstOrThrow(),
  )
}

async function organizations(c: Center) {
  return c.raw.read(tx => tx.db.selectFrom('organization').selectAll().execute())
}

describe('EC2 real SQLite commit boundary', () => {
  it('success changes business and L together; failed commit changes neither', async () => {
    const { c, session: s } = await fixture()
    const before = await activity(c, s)
    const original = await organizations(c)
    c.clock.advance(100)
    c.storage.failNextCommit()
    expect(await request(c, s, OG(21), { name: 'test organization' })).toBe('unavailable')
    expect(await organizations(c)).toEqual(original)
    expect(await activity(c, s)).toEqual(before)
    expect(c.events.defect).toBe(0)
    expect(await request(c, s, OG(21), { name: 'test organization' })).toHaveProperty('result')
    expect(await organizations(c)).toHaveLength(original.length + 1)
    expect((await activity(c, s))['last_activity_at']).toBe(c.clock.current)
  })

  it.each(['clock', 'schema', 'throw', 'swallowed'] as const)(
    '%s after provisional business success rolls back business and L',
    async failure => {
      const { c, session: s } = await fixture()
      const owner: OrganizationsService | undefined = c.ctx.get('organizations')
      if (owner === undefined) throw new Error('missing organizations')
      const participate = owner.participate.bind(owner)
      const before = await organizations(c)
      const loginBefore = await activity(c, s)
      vi.spyOn(owner, 'participate').mockImplementation(unit => {
        const face = participate(unit)
        return {
          ...face,
          createTeam: async account => {
            const result = await face.createTeam(account, 'test organization')
            if (failure === 'clock') c.clock.unavailable = true
            if (failure === 'schema') return { ok: { organization: '', tenant: {} } } as never
            if (failure === 'throw') throw new TypeError('injected after provisional success')
            if (failure === 'swallowed') {
              try {
                await unit.run(async () => {
                  throw new StorageDefect('injected unit failure')
                })
              } catch {
                /* Deliberate defective participant: the unit must stay poisoned. */
              }
            }
            return result
          },
        }
      })
      c.clock.advance(100)
      expect(await request(c, s, OG(21), { name: 'test organization' })).toBe('unavailable')
      c.clock.unavailable = false
      expect(await organizations(c)).toEqual(before)
      expect(await activity(c, s)).toEqual(loginBefore)
      expect(c.events.defect).toBe(failure === 'clock' ? 0 : 1)
    },
  )

  it('confirmed old selection rejects a stale mutation and a repeated switch without touching activity', async () => {
    const { c, session: s } = await fixture()
    const personal = value(await request(c, s, OG(36)))
    if (typeof personal !== 'object' || personal === null || !('account' in personal))
      throw new Error('tenant')
    const team = value(await request(c, s, OG(21), { name: 'test organization' }))
    const selected = { organization: team, account: personal.account }
    const switchPayload = { expectedTenant: personal, targetTenant: selected }
    expect(await request(c, s, OG(37), switchPayload)).toEqual({ result: 'ok' })
    const before = await activity(c, s)
    c.clock.advance(100)
    expect(await request(c, s, OG(37), switchPayload)).toEqual({
      failure: 'expectedTenantMismatch',
    })
    expect(await request(c, s, OG(58), { expectedTenant: personal })).toEqual({
      failure: 'expectedTenantMismatch',
    })
    expect(await request(c, s, OG(58))).toBe('invalid-input')
    expect(await request(c, s, LIST_LOGINS, { expectedTenant: selected })).toBe('invalid-input')
    expect(await activity(c, s)).toEqual(before)
    expect(value(await request(c, s, OG(36)))).toEqual(selected)
  })

  it('named invitation resolves the target only after effective super-administrator authorization; recipient decline is final', async () => {
    const { c, session: s } = await fixture()
    const recipient = await registerAndLogin(c, 'recipient@example.invalid')
    const personal = value(await request(c, s, OG(36)))
    if (typeof personal !== 'object' || personal === null || !('account' in personal))
      throw new Error('tenant')
    const team = value(await request(c, s, OG(21), { name: 'test organization' }))
    const tenant = { organization: team, account: personal.account }
    await request(c, s, OG(37), { expectedTenant: personal, targetTenant: tenant })
    const member = await registerAndLogin(c, 'member@example.invalid')
    const memberPersonal = value(await request(c, member, OG(36)))
    if (
      typeof memberPersonal !== 'object' ||
      memberPersonal === null ||
      !('account' in memberPersonal)
    )
      throw new Error('member tenant')
    const joining = value(
      await request(c, s, OG(23), {
        expectedTenant: tenant,
        invitedAccount: memberPersonal.account,
      }),
    )
    await request(c, member, OG(25), { invitation: joining })
    const memberTenant = { organization: team, account: memberPersonal.account }
    await request(c, member, OG(37), { expectedTenant: memberPersonal, targetTenant: memberTenant })
    const accounts: AccountsService | undefined = c.ctx.get('accounts')
    if (accounts === undefined) throw new Error('accounts')
    const participate = accounts.participate.bind(accounts)
    const lookups = vi.fn()
    vi.spyOn(accounts, 'participate').mockImplementation(unit => {
      const face = participate(unit)
      return {
        ...face,
        resolveActivatedIdentifier: identifier => {
          lookups(identifier)
          return face.resolveActivatedIdentifier(identifier)
        },
      }
    })
    expect(
      await request(c, member, INVITE, {
        expectedTenant: memberTenant,
        loginIdentifier: 'missing@example.invalid',
      }),
    ).toEqual({ failure: 'notAuthorized' })
    expect(lookups).not.toHaveBeenCalled()
    const invitation = value(
      await request(c, s, INVITE, {
        expectedTenant: tenant,
        loginIdentifier: recipient.identifier,
      }),
    )
    expect(lookups).toHaveBeenCalledExactlyOnceWith(recipient.identifier)
    expect(await request(c, recipient, OG(61), { invitation })).toEqual({ result: 'ok' })
    expect(await request(c, recipient, OG(61), { invitation })).toEqual({ result: 'ok' })
    expect(await request(c, recipient, OG(25), { invitation })).toEqual({
      failure: 'offerNoLongerValid',
    })
    expect(
      await request(c, s, INVITE, {
        expectedTenant: tenant,
        loginIdentifier: 'missing@example.invalid',
      }),
    ).toEqual({ failure: 'accountDoesNotExist' })
  })

  it('credential change invalidates every old login; its own finalization does not revive it', async () => {
    const { c, session: s } = await fixture()
    const secondReply = value(
      bodyOf(
        await c.call(envelopeOf(LOGIN, { loginIdentifier: s.identifier, credential: PASSWORD })),
      ),
    )
    if (typeof secondReply !== 'object' || secondReply === null || !('loginState' in secondReply))
      throw new Error('login')
    expect(
      await request(c, s, CHANGE, {
        currentCredential: PASSWORD,
        newCredential: 'replacement password',
      }),
    ).toEqual({ result: 'ok' })
    expect(await request(c, s, LIST_LOGINS)).toBe('login-state-rejected')
    expect(bodyOf(await c.call(envelopeOf(LIST_LOGINS, {}, String(secondReply.loginState))))).toBe(
      'login-state-rejected',
    )
    expect(
      bodyOf(
        await c.call(envelopeOf(LOGIN, { loginIdentifier: s.identifier, credential: PASSWORD })),
      ),
    ).toEqual({ failure: 'identifier-or-credential-rejected' })
    expect(
      bodyOf(
        await c.call(
          envelopeOf(LOGIN, { loginIdentifier: s.identifier, credential: 'replacement password' }),
        ),
      ),
    ).toHaveProperty('result')
  })

  it.each(['revision', 'revocation'] as const)(
    'credential preparation gap: %s is rechecked with G first',
    async competing => {
      const { c, session: s } = await fixture()
      const paused = gate()
      const logins = c.logins()
      const prepare = logins.prepareCredentialChange.bind(logins)
      vi.spyOn(logins, 'prepareCredentialChange').mockImplementationOnce(async (...args) => {
        const result = await prepare(...args)
        await paused.wait()
        return result
      })
      const pending = request(c, s, CHANGE, {
        currentCredential: PASSWORD,
        newCredential: 'first replacement',
      })
      await paused.reached
      try {
        const handle = parseLoginStateId(s.handle)
        if (!isOk(handle)) throw new Error('handle')
        if (competing === 'revision') {
          const ticket = await prepare(handle.ok, PASSWORD, 'competing replacement')
          if (!('ok' in ticket)) throw new Error('prepare')
          expect(
            await c.storage.atomic(unit =>
              logins.participate(unit).commitCredentialChange(ticket.ok),
            ),
          ).toBe('ok')
        } else expect(await logins.revoke(s.handle, handle.ok)).toBe('ok')
      } finally {
        paused.release()
      }
      expect(await pending).toEqual(
        competing === 'revision'
          ? { failure: 'current-credential-rejected' }
          : 'login-state-rejected',
      )
      expect(c.events.defect).toBe(0)
    },
  )

  it.each([false, true])(
    'drain timeout still owns preparation and commit, transport cleanup error=%s',
    async cleanupFailure => {
      const { c, session: s } = await fixture(100)
      const paused = gate()
      const logins = c.logins()
      const prepare = logins.prepareCredentialChange.bind(logins)
      vi.spyOn(logins, 'prepareCredentialChange').mockImplementationOnce(async (...args) => {
        const result = await prepare(...args)
        await paused.wait()
        return result
      })
      if (cleanupFailure) {
        const drain = ClientFace.prototype.drain
        vi.spyOn(ClientFace.prototype, 'drain').mockImplementationOnce(async function (
          this: ClientFace,
          timeout,
        ) {
          await drain.call(this, timeout)
          throw new Error('injected transport cleanup failure')
        })
      }
      const pending = tlsExchange(
        c.port,
        httpRequest(
          JSON.stringify(
            envelopeOf(
              CHANGE,
              { currentCredential: PASSWORD, newCredential: 'replacement after timeout' },
              s.presentation,
            ),
          ),
        ),
      )
      await paused.reached
      let done = false
      const disposing = c.entryFiber?.dispose().then(() => {
        done = true
      })
      try {
        expect((await pending).bytes).toHaveLength(0)
        expect(done).toBe(false)
        // Storage is still owned and usable; network closure did not cancel work.
        expect(await activity(c, s)).toHaveProperty('login_state_id', s.handle)
      } finally {
        paused.release()
      }
      await disposing
      expect(done).toBe(true)
      expect(await logins.exchange(s.presentation)).toEqual({ failure: 'login-state-rejected' })
    },
  )
  it.each([false, true])(
    'a poisoned authorization unit stops further reads; storage defect=%s',
    async defective => {
      const { c, session: s } = await fixture()
      const current = value(await request(c, s, OG(36)))
      if (typeof current !== 'object' || current === null || !('organization' in current))
        throw new Error('tenant')
      const owner: MembershipsService | undefined = c.ctx.get('memberships')
      if (owner === undefined) throw new Error('memberships')
      const participate = owner.participate.bind(owner)
      const reads = vi.fn()
      vi.spyOn(owner, 'participate').mockImplementation(unit => {
        const face = participate(unit)
        return {
          ...face,
          standing: async () =>
            unit.run(async () => {
              reads()
              if (defective) throw new StorageDefect('injected scope defect')
              throw new StorageUnavailable('injected storage failure')
            }),
        }
      })
      expect(
        await request(c, s, OG(34), { organizations: [current.organization, 'org_other'] }),
      ).toBe('unavailable')
      expect(reads).toHaveBeenCalledTimes(1)
      expect(c.events.defect).toBe(defective ? 1 : 0)
    },
  )
})
