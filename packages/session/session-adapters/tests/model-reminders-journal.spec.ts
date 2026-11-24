import { describe, expect, it } from 'vitest'
import type { SystemReminderMessage } from '@omne-harness/message'
import type { SqlStorage } from '@omne-harness/sql-contract'
import type { ModelReminders, StepDirectory } from '@omne-harness/session-adapters/cordis'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { evidence, ok, operation } from './fixtures/common-journal.ts'
import { assistantMessage } from '@omne-harness/session-contract/testing'
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
  const inputs: unknown[] = []
  let pending: SystemReminderMessage | null = told('runtime context: the current values')
  const reminders: ModelReminders<string> = {
    prepare: async input => {
      calls.push(`prepare@${input.at}`)
      inputs.push(input)
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
  return { reminders, calls, inputs }
}

function journalOf(
  s: SqlScene,
  reminders: ModelReminders<string>,
  storage: SqlStorage = s.storage,
  directory?: StepDirectory<string>,
) {
  return createSessionLogJournal<string>({
    ...(directory === undefined ? {} : { directory }),
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
      const { reminders, calls, inputs } = scripted()
      await takeInputs(s, journalOf(s, reminders))
      expect(await modelView(s)).toEqual(['system_reminder', 'user'])
      const work = ok(await s.port.readWork(s.sessionAccess))
      const scope = work.contextScopes?.at(-1)?.scope
      expect(inputs[0]).toMatchObject({ principal: s.access.principal, tenant: s.access.tenant })
      expect((inputs[0] as { scope: { ref: string } }).scope.ref).toBe(scope)
      expect(Number((inputs[1] as { at: string }).at)).toBeGreaterThan(
        Number((inputs[0] as { at: string }).at),
      )
      expect(calls.filter(call => call === 'advance')).toHaveLength(2)
      expect(calls[0]).toMatch(/^prepare@/)
    } finally {
      await s.close()
    }
  })

  it('a write that begins no step tells the model nothing', async () => {
    const s = await sqlScene('reminders-only-steps')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted()
      const journal = journalOf(s, reminders)
      await takeInputs(s, journal)
      const prepared = calls.filter(call => call.startsWith('prepare')).length
      const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
      const message = assistantMessage('reply')
      ok(
        await journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation('reply'),
          authority: loaded.executionAttachment!,
          expected: loaded.revision,
          checkpoint: loaded.checkpoint,
          state: { kind: 'advancing' },
          events: [{ kind: 'message', message, source: evidence('reply-admission') }],
          effects: [],
          caller: {
            kind: 'message',
            message,
            source: evidence('reply-source'),
            admission: evidence('reply-admission'),
          },
          replyAdmission: null,
          handoff: null,
          finish: null,
        }),
      )
      expect(calls.filter(call => call.startsWith('prepare'))).toHaveLength(prepared)
      expect(await modelView(s)).toEqual(['system_reminder', 'user', 'assistant'])
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

// The working directory of a session changes in the action before a step and nowhere else.
describe('the journal settles the working directory before a step, then tells the model (C9)', () => {
  function settling(calls: string[], answer: 'refreshed' | 'unavailable' = 'refreshed') {
    const inputs: unknown[] = []
    const directory: StepDirectory<string> = {
      refresh: async input => {
        calls.push('refresh')
        inputs.push(input)
        return answer === 'refreshed'
          ? { kind: 'refreshed' }
          : { kind: 'unavailable', diagnostic: 'scripted verification failure' }
      },
    }
    return { directory, inputs }
  }

  it('refreshes before it reads what to tell, with the selection of the snapshot it writes on', async () => {
    const s = await sqlScene('directory-first')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted()
      const { directory, inputs } = settling(calls)
      await takeInputs(s, journalOf(s, reminders, s.storage, directory))
      // Reading first would tell the model the directory of the step before this one.
      expect(calls.slice(0, 2)).toEqual(['refresh', expect.stringMatching(/^prepare@/)])
      expect(calls.filter(call => call !== 'advance')).toEqual([
        'refresh',
        expect.stringMatching(/^prepare@/),
        'refresh',
        expect.stringMatching(/^prepare@/),
      ])
      const work = ok(await s.port.readWork(s.sessionAccess))
      expect(inputs[0]).toMatchObject({
        principal: s.access.principal,
        tenant: s.access.tenant,
        session: s.sessionAccess.session,
        scope: { ref: work.contextScopes?.at(-1)?.scope },
        snapshot: { creation: work.creation },
      })
    } finally {
      await s.close()
    }
  })

  it('a write that begins no step leaves the working directory as the step has it', async () => {
    const s = await sqlScene('directory-only-steps')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted()
      const journal = journalOf(s, reminders, s.storage, settling(calls).directory)
      await takeInputs(s, journal)
      const refreshed = calls.filter(call => call === 'refresh').length
      const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
      const message = assistantMessage('reply')
      ok(
        await journal.commit({
          ...s.access,
          execution: s.execution,
          operation: operation('reply'),
          authority: loaded.executionAttachment!,
          expected: loaded.revision,
          checkpoint: loaded.checkpoint,
          state: { kind: 'advancing' },
          events: [{ kind: 'message', message, source: evidence('reply-admission') }],
          effects: [],
          caller: {
            kind: 'message',
            message,
            source: evidence('reply-source'),
            admission: evidence('reply-admission'),
          },
          replyAdmission: null,
          handoff: null,
          finish: null,
        }),
      )
      expect(calls.filter(call => call === 'refresh')).toHaveLength(refreshed)
    } finally {
      await s.close()
    }
  })

  it('commits a changed value into the session log before the step, then writes the step on it', async () => {
    const s = await sqlScene('directory-commit')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted()
      const value = { state: 'default', directory: '/srv/default', files: {} } as const
      const snapshots: unknown[] = []
      const directory: StepDirectory<string> = {
        refresh: async input => {
          calls.push('refresh')
          snapshots.push(input.snapshot)
          // The block holds the value once its commit is in the snapshot the step is written on.
          const held = (input.snapshot.contextRecords ?? []).some(
            record => record.declaration.kind === 'context-step-commit',
          )
          return held ? { kind: 'refreshed' } : { kind: 'commit', value }
        },
      }
      await takeInputs(s, journalOf(s, reminders, s.storage, directory))
      const work = ok(await s.port.readWork(s.sessionAccess))
      const commits = (work.contextRecords ?? []).filter(
        record => record.declaration.kind === 'context-step-commit',
      )
      expect(commits).toHaveLength(1)
      expect(commits[0]?.scope).toBe(work.contextScopes?.at(-1)?.scope)
      // Committed first, then the step was written again on the revision the commit made.
      expect(calls.slice(0, 3)).toEqual(['refresh', 'refresh', expect.stringMatching(/^prepare@/)])
      expect(await modelView(s)).toContain('system_reminder')
    } finally {
      await s.close()
    }
  })

  it('a step commit with an unknown answer fails the step, named, and the next write takes it back', async () => {
    const s = await sqlScene('directory-commit-unknown')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted()
      const value = { state: 'default', directory: '/srv/default', files: {} } as const
      const directory: StepDirectory<string> = {
        refresh: async input =>
          (input.snapshot.contextRecords ?? []).some(
            record => record.declaration.kind === 'context-step-commit',
          )
            ? { kind: 'refreshed' }
            : { kind: 'commit', value },
      }
      const lost: SqlStorage = {
        ...s.storage,
        commit: async (request, options) => {
          const result = await s.storage.commit(request, options)
          return JSON.stringify(request.commands).includes('context-step-commit')
            ? { kind: 'unknown', identity: request.identity, diagnostic: 'lost reply' }
            : result
        },
      } as SqlStorage
      await expect(takeInputs(s, journalOf(s, reminders, lost, directory))).rejects.toThrow(
        /the working directory step commit: lost reply/,
      )
      expect(calls).not.toContain('advance')
      await takeInputs(s, journalOf(s, reminders, s.storage, directory))
      const work = ok(await s.port.readWork(s.sessionAccess))
      expect(
        (work.contextRecords ?? []).filter(
          record => record.declaration.kind === 'context-step-commit',
        ),
      ).toHaveLength(1)
    } finally {
      await s.close()
    }
  })

  it('a verification that cannot be done fails the step: nothing is told, no input is delivered', async () => {
    const s = await sqlScene('directory-fail')
    try {
      ok(await s.view.journal.open(s.openInput))
      const { reminders, calls } = scripted()
      const journal = journalOf(s, reminders, s.storage, settling(calls, 'unavailable').directory)
      await expect(takeInputs(s, journal)).rejects.toThrow(/scripted verification failure/)
      expect(calls).toEqual(['refresh'])
      expect(await modelView(s)).toEqual([])
    } finally {
      await s.close()
    }
  })
})
