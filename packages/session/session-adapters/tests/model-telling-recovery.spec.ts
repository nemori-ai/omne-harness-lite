// @module-tag slow
import { expect, it } from 'vitest'
import type { SqlIdentity, SqlStorage } from '@omne-harness/sql-contract'
import { openContextScope } from '../src/cordis/model-reminder-commit.ts'
import { judgeMessage } from '@omne-harness/message'
import type { ModelReminders } from '../src/cordis/model-reminders.ts'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'
import { evidence, ok } from './fixtures/common-journal.ts'
import { sqlScene } from './fixtures/sql-scene.ts'

it.each(['committed', 'not-submitted'] as const)(
  'C6 recognises %s unknown reminder by its original SQL identity before preparing again',
  async standing => {
    const s = await sqlScene('reminder-original-identity', { storage: 'real' })
    try {
      ok(await s.view.journal.open(s.openInput))
      const judged = judgeMessage({
        id: 'msg_abcdefghijklmnopqrstuv',
        role: 'system_reminder',
        blocks: [
          {
            kind: 'text',
            id: 'guidance',
            text: 'shared ancestor',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      if (!('ok' in judged)) throw new Error('invalid reminder')
      const message = judged.ok
      if (message.role !== 'system_reminder') throw new Error('expected reminder')
      let pending = true
      let prepares = 0
      const reminders: ModelReminders<string> = {
        prepare: async () => {
          prepares++
          return {
            ok: {
              messages: pending ? [message] : [],
              viewRevision: '1',
              advance: () => {
                pending = false
              },
            },
          }
        },
        forget: () => undefined,
      }
      const identities: SqlIdentity[] = []
      let lost = false
      const storage: SqlStorage = {
        ...s.storage,
        commit: async request => {
          if (!JSON.stringify(request.commands).includes('context-reminder'))
            return s.storage.commit(request)
          identities.push(request.identity)
          if (lost) return s.storage.commit(request)
          lost = true
          if (standing === 'committed') await s.storage.commit(request)
          return { kind: 'unknown', identity: request.identity, diagnostic: 'lost reminder reply' }
        },
      }
      const journals = createSessionLogJournal({
        storage,
        combination: s.combination,
        reminders,
        tenantDomainLookup: { lookup: async () => ({ kind: 'ready', domain: s.domain }) },
        sessionAccessCheck: {
          check: async () => ({ kind: 'allowed', evidence: evidence('allowed') }),
        },
      })
      const scope = openContextScope({
        tenant: s.access.tenant,
        session: s.access.session,
        snapshot: ok(await s.port.readWork(s.access)),
      })
      if (scope === null) throw new Error('expected scope')
      const input = { ...s.access, scope }
      expect(await journals.ensureModelHistory(input)).toMatchObject({
        failure: { kind: 'unavailable' },
      })
      expect(prepares).toBe(1)
      ok(await journals.ensureModelHistory(input))
      expect(identities).toHaveLength(2)
      expect(identities[1]).toEqual(identities[0])
      expect(prepares).toBe(2)
      const view = ok(
        await s.port.history.readModelView({
          ...s.access,
          basis: null,
          after: null,
          pageBytes: 100000,
        }),
      )
      if (view.kind !== 'page') throw new Error('expected page')
      expect(view.rows.filter(row => row.message.role === 'system_reminder')).toHaveLength(1)
    } finally {
      await s.close()
    }
  },
)

it('C3/C6 two Session reminder preparers re-read after a conditional commit conflict', async () => {
  const s = await sqlScene('reminder-preparers', { storage: 'real' })
  try {
    ok(await s.view.journal.open(s.openInput))
    const judged = judgeMessage({
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'system_reminder',
      blocks: [
        {
          kind: 'text',
          id: 'guidance',
          text: 'shared ancestor',
          visibility: { toHuman: true, toModel: true },
        },
      ],
    })
    if (!('ok' in judged) || judged.ok.role !== 'system_reminder')
      throw new Error('invalid reminder')
    const message = judged.ok
    let release: () => void = () => undefined
    const bothPrepared = new Promise<void>(resolve => {
      release = resolve
    })
    let firstReads = 0
    let conflicts = 0
    let advances = 0
    const storage: SqlStorage = {
      ...s.storage,
      commit: async request => {
        const answer = await s.storage.commit(request)
        if (
          answer.kind === 'rolled_back' &&
          JSON.stringify(request.commands).includes('context-reminder')
        )
          conflicts++
        return answer
      },
    }
    const make = (version: string) => {
      const reminders: ModelReminders<string> = {
        prepare: async () => {
          const view = ok(
            await s.port.history.readModelView({
              ...s.access,
              basis: null,
              after: null,
              pageBytes: 100000,
            }),
          )
          if (view.kind !== 'page') throw new Error('expected page')
          const missing = !view.rows.some(row => row.message.id === message.id)
          if (missing && firstReads < 2) {
            firstReads++
            if (firstReads === 2) release()
            await bothPrepared
          }
          return {
            ok: {
              messages: missing ? [message] : [],
              viewRevision: version,
              advance: () => {
                advances++
              },
            },
          }
        },
        forget: () => undefined,
      }
      return createSessionLogJournal({
        storage,
        combination: s.combination,
        reminders,
        tenantDomainLookup: { lookup: async () => ({ kind: 'ready', domain: s.domain }) },
        sessionAccessCheck: {
          check: async () => ({ kind: 'allowed', evidence: evidence('allowed') }),
        },
      })
    }
    const [first, second] = [make('1'), make('2')]
    const scope = openContextScope({
      tenant: s.access.tenant,
      session: s.access.session,
      snapshot: ok(await s.port.readWork(s.access)),
    })
    if (scope === null) throw new Error('expected scope')
    const outcomes = await Promise.all([
      first.ensureModelHistory({ ...s.access, scope }),
      second.ensureModelHistory({ ...s.access, scope }),
    ])
    outcomes.forEach(outcome => ok(outcome))
    expect(firstReads).toBe(2)
    expect(conflicts).toBe(1)
    expect(advances).toBe(3)
    const view = ok(
      await s.port.history.readModelView({
        ...s.access,
        basis: null,
        after: null,
        pageBytes: 100000,
      }),
    )
    if (view.kind !== 'page') throw new Error('expected page')
    expect(view.rows.map(row => row.message.id)).toEqual([message.id])
  } finally {
    await s.close()
  }
})

it.each(['definite', 'unknown'] as const)(
  'C6 concurrent %s result cannot discard another original reminder operation',
  async secondResult => {
    const s = await sqlScene(`reminder-pending-${secondResult}`, { storage: 'real' })
    try {
      ok(await s.view.journal.open(s.openInput))
      const snapshot = ok(await s.port.readWork(s.access))
      const scope = openContextScope({ ...s.access, snapshot })
      if (scope === null) throw new Error('expected scope')
      const judged = judgeMessage({
        id: 'msg_abcdefghijklmnopqrstuv',
        role: 'system_reminder',
        blocks: [
          {
            kind: 'text',
            id: 'guidance',
            text: 'shared ancestor',
            visibility: { toHuman: true, toModel: true },
          },
        ],
      })
      if (!('ok' in judged) || judged.ok.role !== 'system_reminder')
        throw new Error('invalid reminder')
      const { reminderCommand } = await import('../src/cordis/model-reminder-commit.ts')
      const { createModelTellingSteps } = await import('../src/cordis/model-telling-steps.ts')
      const first = reminderCommand({
        ...s.access,
        scope,
        at: snapshot.revision,
        viewRevision: 'first',
        message: judged.ok,
      })
      const second = reminderCommand({
        ...s.access,
        scope,
        at: snapshot.revision,
        viewRevision: 'second',
        message: judged.ok,
      })
      const identities: SqlIdentity[] = []
      let entering: () => void = () => undefined
      const entered = new Promise<void>(resolve => {
        entering = resolve
      })
      let release: () => void = () => undefined
      const finishFirst = new Promise<void>(resolve => {
        release = resolve
      })
      let firstAttempt = true
      let secondAttempt = true
      const storage: SqlStorage = {
        ...s.storage,
        commit: async request => {
          identities.push(request.identity)
          if (request.identity.operation === first.input.operation && firstAttempt) {
            firstAttempt = false
            entering()
            await finishFirst
            return { kind: 'unknown', identity: request.identity, diagnostic: 'first uncertain' }
          }
          if (request.identity.operation === second.input.operation && secondAttempt) {
            secondAttempt = false
            const answer = await s.storage.commit(request)
            return secondResult === 'definite'
              ? answer
              : { kind: 'unknown', identity: request.identity, diagnostic: 'second uncertain' }
          }
          return s.storage.commit(request)
        },
      }
      const steps = createModelTellingSteps<
        string,
        {
          tenant: typeof s.access.tenant
          tenantText: string
          session: typeof s.access.session
          published: null
        }
      >({
        storage,
        combination: s.combination,
        generations: new Map(),
        read: async () => ({ ok: snapshot }),
      })
      const book = {
        tenant: s.access.tenant,
        tenantText: s.tenantText(s.access.tenant),
        session: s.access.session,
        published: null,
      }
      const firstCommit = steps.commit(book, s.domain, first)
      await entered
      const secondCommit = steps.commit(book, s.domain, second)
      // Both calls are in flight. The first unknown arrives before the second result settles.
      release()
      expect((await firstCommit).kind).toBe('unknown')
      await secondCommit
      const beforeRecovery = identities.length
      expect(await steps.recover(book, s.domain)).toEqual({ kind: 'again' })
      expect(identities[beforeRecovery]).toEqual(identities[0])
      if (secondResult === 'unknown') {
        expect(await steps.recover(book, s.domain)).toEqual({ kind: 'again' })
        expect(identities.at(-1)).toEqual(identities[1])
      }
      expect(await steps.recover(book, s.domain)).toBeNull()
    } finally {
      await s.close()
    }
  },
)
