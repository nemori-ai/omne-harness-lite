import { describe, expect, it } from 'vitest'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import { inProcessPrincipalAuthority } from '@omne-harness/identity'
import type { TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createSettingsGuard,
  settingsAdmission,
  type SettingsAction,
} from '../../../src/rows/authorization/settings-access.ts'
import { fixtureTenant, okOf } from '../../entry/support.ts'

const A = fixtureTenant('a')
const B = fixtureTenant('b')
const authority = inProcessPrincipalAuthority()
const system = okOf(authority.issuer.issueSystem({ component: 'server-entry' }), 'system')
function acting(tenant: TenantId, owner: string, work: string): ActingForTenantPrincipal {
  return okOf(
    authority.issuer.issueActingForTenant({ actor: system, tenant, work: { owner, work } }),
    'acting',
  )
}
const login = acting(A, 'identity-login', 'lgn_a')
const work = acting(A, 'session', 'ses_a')
const card = { owner: 'human-intervention', record: 'card/1', revision: '1', digest: 'card' }
const said = { owner: 'human-intervention', record: 'reply/1', revision: '1', digest: 'said' }
const standing = (principal: unknown = work, option = 'allow-always') => ({
  kind: 'card-answer' as const,
  principal,
  card,
  source: said,
  option,
})
const ACTIONS: readonly SettingsAction[] = ['list', 'describe', 'set', 'clear']
const asked = (principal: unknown, action: SettingsAction, tenant: TenantId = A) => ({
  principal,
  tenant,
  action,
})

describe('who may ask a settings face, before the member check', () => {
  it('lets a login of the tenant ask every action, as the settings operation on the tenant scope', () => {
    for (const action of ACTIONS)
      expect(settingsAdmission(asked(login, action))).toMatchObject({
        access: { principal: login, tenant: A },
        operation: { owner: 'settings', name: `setting-${action}` },
        target: { owner: 'settings', kind: 'tenant-scope' },
        requires: [],
        permit: null,
      })
  })

  it('takes no work of a session on a face that takes no card answers', () => {
    for (const action of ACTIONS) {
      expect(settingsAdmission(asked(work, action))).toBeUndefined()
      expect(settingsAdmission(asked(standing(), action))).toBeUndefined()
    }
  })

  it('on a face that takes card answers, lets the work of a session read one item bare and set one with an answer', () => {
    const admitted = (principal: unknown, action: SettingsAction) =>
      settingsAdmission(asked(principal, action), true) !== undefined
    expect(ACTIONS.map(action => admitted(work, action))).toEqual([false, true, false, false])
    expect(ACTIONS.map(action => admitted(standing(), action))).toEqual([false, false, true, false])
    expect(settingsAdmission(asked(standing(), 'set'), true)).toMatchObject({
      access: { principal: work, tenant: A },
      operation: { owner: 'settings', name: 'setting-set' },
    })
  })

  it.each([
    ['a system principal', system],
    ['a login that carries a card answer', standing(login)],
    ['no principal', null],
    ['a text', 'login'],
    ['a card answer around no principal', standing(null)],
    ['a principal of another tenant', acting(B, 'identity-login', 'lgn_b')],
    ['the work of a session of another tenant', acting(B, 'session', 'ses_b')],
  ])('takes %s on no action', (_who, principal) => {
    for (const action of ACTIONS)
      expect(settingsAdmission(asked(principal, action), true)).toBeUndefined()
  })
})

type Reply = Parameters<typeof succeed>[0]
function guarding(reply: unknown, admission: 'allowed' | 'denied' | 'unavailable' = 'allowed') {
  const reads: unknown[] = []
  const checks: unknown[] = []
  const guard = createSettingsGuard(
    () => ({
      check: async input => {
        checks.push(input)
        return { kind: admission } as never
      },
    }),
    () =>
      reply === undefined
        ? undefined
        : ({
            read: async (input: unknown) => {
              reads.push(input)
              return reply
            },
          } as never),
  )
  return { guard, reads, checks }
}
const chosen = (option: string, evidence = said) =>
  succeed({ kind: 'chosen', option, value: null, evidence } as Reply)

describe('the settings guard', () => {
  it('answers denied to a principal it takes on no action, without asking the member check', async () => {
    for (const principal of [null, 'text', 7, system]) {
      const w = guarding(chosen('allow-always'))
      expect(await w.guard.qualify(asked(principal, 'set'))).toEqual({ kind: 'denied' })
      expect(w.checks).toEqual([])
    }
  })

  it('passes the member check through, and reads no card for a bare principal', async () => {
    for (const kind of ['allowed', 'denied', 'unavailable'] as const) {
      const w = guarding(chosen('allow-always'), kind)
      expect(await w.guard.qualify(asked(login, 'set'))).toEqual({ kind })
      expect(w.reads).toEqual([])
    }
  })

  it('answers unavailable while no member check is installed', async () => {
    const guard = createSettingsGuard(() => undefined)
    expect(await guard.qualify(asked(login, 'list'))).toEqual({ kind: 'unavailable' })
  })

  it('lets a card answer stand only when the card holds that very answer, read as the work of the session', async () => {
    const w = guarding(chosen('allow-always'))
    expect(await w.guard.qualify(asked(standing(), 'set'))).toEqual({ kind: 'allowed' })
    expect(w.reads).toEqual([{ principal: work, tenant: A, card }])
  })

  it.each([
    ['another option', chosen('allow-once')],
    ['another answer', chosen('allow-always', { ...said, digest: 'other' })],
    ['no answer yet', succeed({ kind: 'pending' } as Reply)],
    [
      'words that name the same option',
      succeed({ kind: 'remark', option: 'allow-always', evidence: said } as Reply),
    ],
  ])('denies a card answer when the card holds %s', async (_what, reply) => {
    expect(await guarding(reply).guard.qualify(asked(standing(), 'set'))).toEqual({
      kind: 'denied',
    })
  })

  it('answers unavailable while the card cannot be read, and never reads it once the member check refuses', async () => {
    const failing = guarding(fail({ kind: 'unavailable' }))
    expect(await failing.guard.qualify(asked(standing(), 'set'))).toEqual({ kind: 'unavailable' })
    const absent = guarding(undefined)
    expect(await absent.guard.qualify(asked(standing(), 'set'))).toEqual({ kind: 'unavailable' })
    const refused = guarding(chosen('allow-always'), 'denied')
    expect(await refused.guard.qualify(asked(standing(), 'set'))).toEqual({ kind: 'denied' })
    expect(refused.reads).toEqual([])
  })
})
