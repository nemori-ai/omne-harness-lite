// @module-tag slow
import { expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { sqlScene, takeInputs } from './fixtures/sql-scene.ts'
import { ok, evidence } from './fixtures/common-journal.ts'

it.each([4, 20])(
  'bounds preparation separately from publication races when %i reminders are waiting',
  async initial => {
    const s = await sqlScene('model-step-settlement', { storage: 'real' })
    try {
      ok(await s.view.journal.open(s.openInput))
      const snapshot = ok(await s.port.readWork(s.access))
      let pending = initial
      let refreshed = 0
      const holder = createSessionLogJournal<string>({
        storage: s.storage,
        combination: s.combination,
        tenantDomainLookup: { lookup: async () => ({ kind: 'ready', domain: s.domain }) },
        sessionAccessCheck: {
          check: async () => ({ kind: 'allowed', evidence: evidence('allowed') }),
        },
        directory: {
          refresh: async () => {
            refreshed++
            return { kind: 'refreshed' as const }
          },
        },
        reminders: {
          prepare: async () => {
            const message = judgeMessage({
              id: `msg_${String(pending).padStart(22, '0')}`,
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
      const journal = holder.forSession(s.access).journal
      if (initial === 4) {
        await takeInputs(s, journal)
        expect(pending).toBe(0)
        expect(refreshed).toBe(5)
      } else {
        await expect(takeInputs(s, journal)).rejects.toThrow(
          'the model step prerequisites kept changing',
        )
        expect(pending).toBe(4)
        expect(refreshed).toBe(16)
      }
      expect(ok(await s.port.readWork(s.access)).revision).not.toBe(snapshot.revision)
    } finally {
      await s.close()
    }
  },
)
