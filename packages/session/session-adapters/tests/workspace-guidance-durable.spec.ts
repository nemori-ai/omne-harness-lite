// @module-tag slow
import { expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import type { CommitRequestV2, SqlIdentity, SqlStorage } from '@omne-harness/sql-contract'
import { openContextScope } from '../src/cordis/model-reminder-commit.ts'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { evidence, ok } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

it.each(['committed', 'not-submitted'] as const)(
  'C6 a fresh journal locates the original %s guidance attempt after losing all reader and retry state',
  async standing => {
    const s = await sqlScene('cold-guidance-identity', { storage: 'real' })
    try {
      ok(await s.view.journal.open(s.openInput))
      const access = s.access
      const scope = openContextScope({ ...access, snapshot: ok(await s.port.readWork(access)) })
      if (!scope) throw new Error('missing scope')
      const judged = judgeMessage({
        role: 'system_reminder',
        id: 'msg_abcdefghijklmnopqrstuv',
        blocks: [
          {
            kind: 'text',
            id: 'blk_guidance_demo',
            text: 'persisted-directory',
            visibility: { toModel: true, toHuman: true },
          },
        ],
      })
      if ('rejected' in judged || judged.ok.role !== 'system_reminder')
        throw new Error('invalid fixture')
      const message = judged.ok
      const view = async () => {
        const read = ok(
          await s.port.history.readModelView({
            ...access,
            after: null,
            basis: null,
            pageBytes: 100000,
          }),
        )
        if (read.kind !== 'page') throw new Error('no history')
        return read
      }
      let original: CommitRequestV2 | undefined
      let lost: SqlIdentity | undefined
      let outage: 'unknown' | 'throw' | null = null
      let restarted = false
      const queried: SqlIdentity[] = []
      const storage: SqlStorage = {
        ...s.storage,
        commit: async req => {
          if (!lost && JSON.stringify(req.commands).includes('persisted-directory')) {
            original = req
            lost = req.identity
            if (standing === 'committed') await s.storage.commit(req)
            return { kind: 'unknown', identity: req.identity, diagnostic: 'response lost' }
          }
          return s.storage.commit(req)
        },
        query: async identity => {
          if (restarted) queried.push(identity)
          if (outage === 'throw') throw new Error('receipt store offline')
          if (outage === 'unknown')
            return { kind: 'unknown', identity, diagnostic: 'receipt store recovering' }
          return s.storage.query(identity)
        },
      }
      const journal = () =>
        createSessionLogJournal({
          storage,
          combination: s.combination,
          reminders: {
            forget: () => undefined,
            prepare: async () => {
              const page = await view()
              return {
                ok: {
                  messages: page.rows.some(row => row.message.id === message.id) ? [] : [message],
                  viewRevision: '1',
                  modelView: page.basis,
                  advance() {},
                },
              }
            },
          },
          tenantDomainLookup: { lookup: async () => ({ kind: 'ready', domain: s.domain }) },
          sessionAccessCheck: {
            check: async () => ({ kind: 'allowed', evidence: evidence('allowed') }),
          },
        })
      expect(await journal().ensureModelHistory({ ...access, scope })).toHaveProperty('failure')
      expect(lost).toBeDefined()
      restarted = true
      const fresh = journal()
      if (standing === 'committed') {
        for (const fault of ['unknown', 'throw'] as const) {
          outage = fault
          expect(await fresh.ensureModelHistory({ ...access, scope })).toMatchObject({
            failure: { kind: 'unavailable', owner: 'session-log-journal' },
          })
        }
        outage = null
      }
      ok(await fresh.ensureModelHistory({ ...access, scope }))
      expect(queried).toContainEqual(lost)
      if (standing === 'not-submitted') {
        if (!original) throw new Error('original request missing')
        expect(await s.storage.commit(original)).toMatchObject({ kind: 'rolled_back' })
      }
      expect((await view()).rows.filter(row => row.message.id === message.id)).toHaveLength(1)
    } finally {
      await s.close()
    }
  },
  60000,
)
