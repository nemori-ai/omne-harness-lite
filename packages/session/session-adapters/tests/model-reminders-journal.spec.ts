import { describe, expect, it } from 'vitest'
import type { SystemReminderMessage } from '@omne-harness/message'
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { ModelReminders } from '@omne-harness/session-adapters/cordis'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { evidence, ok } from './fixtures/common-journal.ts'
import { sqlScene, takeInputs, type SqlScene } from './fixtures/sql-scene.ts'

function told(text: string): SystemReminderMessage {
  return {
    id: `msg_${text.replace(/\W/g, '').padEnd(22, 'x')}` as SystemReminderMessage['id'],
    role: 'system_reminder',
    blocks: [
      {
        kind: 'text',
        id: `blk_${text.replace(/\W/g, '')}` as never,
        visibility: { toHuman: true, toModel: true },
        text,
      },
    ],
  }
}

// A holder that has one reminder to tell until it is told; it records what the journal did.
function scripted(answer: 'tell' | 'fail' = 'tell') {
  const calls: string[] = []
  let pending: SystemReminderMessage | null = told('runtime context: the current values')
  const reminders: ModelReminders<string> = {
    prepare: async input => {
      calls.push(`prepare@${input.at}`)
      if (answer === 'fail')
        return { failure: { kind: 'unavailable', diagnostic: 'scripted read failure' } }
      const messages = pending === null ? [] : [pending]
      return {
        ok: {
          messages,
          viewRevision: '1',
          advance: () => {
            calls.push('advance')
            pending = null
          },
        },
      }
    },
    forget: () => calls.push('forget'),
  }
  return { reminders, calls }
}

function journalOf(
  s: SqlScene,
  reminders: ModelReminders<string>,
  storage: SqlStorage = s.storage,
) {
  return createSessionLogJournal<string>({
    storage,
    tenantDomainLookup: { lookup: () => Promise.resolve({ kind: 'ready', domain: s.domain }) },
    sessionAccessCheck: {
      check: request =>
        Promise.resolve({ kind: 'allowed', evidence: evidence(`access/${request.operation}`) }),
    },
    combination: s.combination,
    reminders,
  }).forSession(s.access).journal
}

async function modelView(s: SqlScene) {
  const page = ok(
    await s.port.history.readModelView({
      ...s.access,
      basis: null,
      after: null,
      pageBytes: 100_000,
    }),
  )
  if (page.kind !== 'page') throw new Error('a page of the model view is expected')
  return page.rows.map(row => row.message.role)
}

describe('the journal tells the model before a step takes its inputs (C4, C7)', () => {
  it('commits the reminder first: it is the first message the model sees, before the delivered input', async () => {
    const s = await sqlScene('reminders-first')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted()
      await takeInputs(s, journalOf(s, reminders))
      expect(await modelView(s)).toEqual(['system_reminder', 'user'])
      expect(calls.filter(call => call === 'advance')).toHaveLength(2)
      expect(calls[0]).toMatch(/^prepare@/)
    } finally {
      await s.close()
    }
  })

  it('a read that fails fails the step: no reminder, no delivered input', async () => {
    const s = await sqlScene('reminders-fail')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted('fail')
      await expect(takeInputs(s, journalOf(s, reminders))).rejects.toThrow(/scripted read failure/)
      expect(await modelView(s)).toEqual([])
      expect(calls).not.toContain('advance')
    } finally {
      await s.close()
    }
  })

  it('a reminder commit with an unknown answer fails the step and tells nothing as told', async () => {
    const s = await sqlScene('reminders-unknown')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted()
      const lost: SqlStorage = {
        ...s.storage,
        commit: async (request, options) => {
          const result = await s.storage.commit(request, options)
          return JSON.stringify(request.commands).includes('context-reminder')
            ? { kind: 'unknown', identity: request.identity, diagnostic: 'lost reply' }
            : result
        },
      } as SqlStorage
      await expect(takeInputs(s, journalOf(s, reminders, lost))).rejects.toThrow(/lost reply/)
      expect(calls).not.toContain('advance')
      await takeInputs(s, journalOf(s, reminders))
      expect(
        (await modelView(s)).filter(role => role === 'system_reminder').length,
      ).toBeGreaterThan(0)
    } finally {
      await s.close()
    }
  })
})
