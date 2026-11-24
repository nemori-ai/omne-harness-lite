// @module-tag slow
import { expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import { tenantCodec } from '@omne-harness/legal-identity'
import { createModelTelling } from '../src/cordis/model-telling.ts'
import { sqlScene } from './fixtures/sql-scene.ts'
import { ok } from './fixtures/common-journal.ts'

it('settles four owned prerequisite commits before asking the Agent publication to try again once', async () => {
  const s = await sqlScene('model-step-settlement', { storage: 'real' })
  try {
    ok(await s.view.journal.open(s.openInput))
    const snapshot = ok(await s.port.readWork(s.access))
    const tenant = tenantCodec.encode(s.access.tenant)
    if (!tenant.ok) throw new Error('invalid tenant')
    let pending = 4
    let refreshed = 0
    const actions = createModelTelling({
      storage: s.storage,
      combination: s.combination,
      generations: new Map(),
      read: async () => ({ ok: ok(await s.port.readWork(s.access)) }),
      directory: {
        refresh: async () => {
          refreshed++
          return { kind: 'refreshed' as const }
        },
      },
      reminders: {
        prepare: async () => {
          const message = judgeMessage({
            id: `msg_${String(pending).repeat(22)}`,
            role: 'system_reminder',
            blocks: [
              {
                kind: 'text',
                id: `prerequisite-${pending}`,
                text: `owned prerequisite ${pending}`,
                visibility: { toModel: true, toHuman: true },
              },
            ],
          })
          if (!('ok' in message) || message.ok.role !== 'system_reminder')
            throw new Error('invalid reminder')
          return {
            ok: {
              messages: pending > 0 ? [message.ok] : [],
              viewRevision: String(pending),
              advance: () => {
                if (pending > 0) pending--
              },
            },
          }
        },
        forget() {},
      },
    })
    const book = { ...s.access, tenantText: tenant.value, published: null }
    expect(
      await actions.beforeStep(book, s.domain, s.access, { snapshot, commands: [] }, [
        { facts: [{ kind: 'step.begun', step: '0' }] },
      ] as never),
    ).toEqual({ kind: 'again' })
    expect(pending).toBe(0)
    expect(refreshed).toBe(5)
    expect(ok(await s.port.readWork(s.access)).revision).not.toBe(snapshot.revision)
  } finally {
    await s.close()
  }
})
