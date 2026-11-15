import { describe, expect, it } from 'vitest'
import type { ShellLoginState } from '@omne-harness/shell-contract'
import {
  FAILED_TEXT,
  createAccountModel,
  type AccountState,
  type TenantQuery,
} from '../src/model/account.ts'
import { TENANT_TEXT, deferred, loginSource, settle, tenantId, type Deferred } from './support.ts'

type Answer = Awaited<ReturnType<TenantQuery['query-current-tenant']>>

const SUCCEEDED = { outcome: 'succeeded', body: { tenantId: tenantId() } } as unknown as Answer
const answered = (outcome: string) => ({ outcome, body: {} }) as unknown as Answer

function setup(initial: ShellLoginState = 'signed-in') {
  const login = loginSource(initial)
  const pending: Deferred<Answer>[] = []
  const scopes: (string | undefined)[] = []
  const query: TenantQuery = {
    'query-current-tenant': () => {
      const next = deferred<Answer>()
      pending.push(next)
      return next.promise
    },
  } as unknown as TenantQuery
  const model = createAccountModel({ query, login, scope: { set: scope => scopes.push(scope) } })
  const answer = async (value: Answer, at = pending.length - 1) => {
    pending[at]!.resolve(value)
    await settle()
  }
  return { login, model, pending, scopes, answer }
}

async function reach(kind: AccountState['kind']) {
  const t = setup(kind === 'idle' ? 'signed-out' : 'signed-in')
  if (kind === 'read') await t.answer(SUCCEEDED)
  if (kind === 'failed') await t.answer(answered('uncertain'))
  expect(t.model.current().kind).toBe(kind)
  return t
}

describe('账号块的模型：状态乘事件', () => {
  describe('登录状态变成「已登录」', () => {
    it('还没查：去查', async () => {
      const t = await reach('idle')
      t.login.set('signed-in')
      expect(t.model.current().kind).toBe('reading')
      expect(t.pending).toHaveLength(1)
    })
    it('查着：不再发一次', async () => {
      const t = await reach('reading')
      t.login.set('signed-in')
      expect(t.pending).toHaveLength(1)
    })
    it('查到：不变', async () => {
      const t = await reach('read')
      t.login.set('signed-in')
      expect(t.model.current().kind).toBe('read')
      expect(t.pending).toHaveLength(1)
    })
    it('查不到：不变，等人按重试', async () => {
      const t = await reach('failed')
      t.login.set('signed-in')
      expect(t.model.current().kind).toBe('failed')
      expect(t.pending).toHaveLength(1)
    })
  })

  describe('登录状态离开「已登录」', () => {
    it('还没查：不变', async () => {
      const t = await reach('idle')
      t.login.set('signing-in')
      expect(t.model.current().kind).toBe('idle')
      expect(t.pending).toHaveLength(0)
    })
    it('查着：回到还没查，迟到的答复不再设租户', async () => {
      const t = await reach('reading')
      t.login.set('signing-out')
      expect(t.model.current().kind).toBe('idle')
      await t.answer(SUCCEEDED)
      expect(t.scopes).toEqual([])
      expect(t.model.current().kind).toBe('idle')
    })
    it('查到：回到还没查；再登录时重新查', async () => {
      const t = await reach('read')
      t.login.set('signed-out')
      expect(t.model.current().kind).toBe('idle')
      t.login.set('signed-in')
      expect(t.pending).toHaveLength(2)
    })
    it('查不到：回到还没查', async () => {
      const t = await reach('failed')
      t.login.set('signed-out')
      expect(t.model.current().kind).toBe('idle')
    })
  })

  describe('人按重试', () => {
    it('还没查、查着、查到：什么都不做', async () => {
      for (const kind of ['idle', 'reading', 'read'] as const) {
        const t = await reach(kind)
        const sent = t.pending.length
        t.model.retry()
        expect(t.model.current().kind).toBe(kind)
        expect(t.pending).toHaveLength(sent)
      }
    })
    it('查不到：再查一次', async () => {
      const t = await reach('failed')
      t.model.retry()
      expect(t.model.current().kind).toBe('reading')
      expect(t.pending).toHaveLength(2)
      await t.answer(SUCCEEDED)
      expect(t.model.current()).toMatchObject({ kind: 'read', tenant: TENANT_TEXT })
    })
  })

  describe('协议客户端没了（模型停下）', () => {
    it('查着：迟到的答复不再作用，不设租户', async () => {
      const t = await reach('reading')
      t.model.dispose()
      await t.answer(SUCCEEDED)
      expect(t.model.current().kind).toBe('reading')
      expect(t.scopes).toEqual([])
    })
    it('任何状态：不再跟登录状态，重试不发请求，租户不动', async () => {
      for (const kind of ['idle', 'read', 'failed'] as const) {
        const t = await reach(kind)
        const sent = t.pending.length
        const scopes = t.scopes.length
        t.model.dispose()
        expect(t.login.listeners()).toBe(0)
        t.model.retry()
        t.login.set(kind === 'idle' ? 'signed-in' : 'signed-out')
        expect(t.model.current().kind).toBe(kind)
        expect(t.pending).toHaveLength(sent)
        expect(t.scopes).toHaveLength(scopes)
      }
    })
  })

  describe('查的答复', () => {
    it('成功：设租户，显示短的组织', async () => {
      const t = await reach('reading')
      await t.answer(SUCCEEDED)
      expect(t.scopes).toEqual([TENANT_TEXT])
      expect(t.model.current()).toEqual({
        kind: 'read',
        tenant: TENANT_TEXT,
        short: 'org_0000…0000',
      })
    })
    it.each([
      ['denied', FAILED_TEXT.denied],
      ['uncertain', FAILED_TEXT.uncertain],
      ['unavailable', FAILED_TEXT.unavailable],
      ['stage-not-provided', FAILED_TEXT.unavailable],
    ])('%s：查不到，显示原因', async (outcome, text) => {
      const t = await reach('reading')
      await t.answer(answered(outcome))
      expect(t.model.current()).toEqual({ kind: 'failed', text })
      expect(t.scopes).toEqual([])
    })
  })
})
