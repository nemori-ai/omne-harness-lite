import { expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import { sqlScene } from './fixtures/sql-scene.ts'
import { retainedCompaction, compactionFixtureGeneration } from './fixtures/compaction.ts'
import { ok, operation } from './fixtures/common-journal.ts'
import type { SqlStorage } from '@omne-harness/sql-contract'
import { createSessionLogJournal } from '../src/cordis/agent-journal.ts'

it.each([
  ['compaction-adoption-sql', 'real', null],
  ['compaction-adoption-%0a', 'real', null],
  ['compaction-adoption-narrow', 'double', null],
  ['compaction-adoption-unknown-applied', 'real', 'applied'],
  ['compaction-adoption-unknown-dropped', 'real', 'dropped'],
] as const)(
  'adopts and cold-recovers one result and consumption for %s',
  async (name, storage, fault) => {
    const s = await sqlScene(name, { storage })
    try {
      const opened = ok(await s.view.journal.open(s.openInput))
      const page = ok(
        await s.port.history.readModelView({
          ...s.access,
          basis: null,
          after: null,
          pageBytes: 100000,
        }),
      )
      if (page.kind !== 'page') throw new Error('model view expected')
      const history = ok(
        await s.port.history.begin({
          ...s.access,
          kinds: [],
          from: null,
          direction: 'forward',
          pageBytes: 100000,
        }),
      )
      const message = judgeMessage({
        id: 'msg_abcdefghijklmnopqrstuv',
        role: 'compaction',
        blocks: [
          {
            kind: 'text',
            id: 'summary',
            text: 'summary',
            visibility: { toModel: true, toHuman: true },
          },
        ],
        covers: { from: history.entries[0]!.id, to: page.rows.at(-1)!.entry },
        retained: page.rows.map(row => row.entry),
        derivation: compactionFixtureGeneration,
      })
      if (!('ok' in message)) throw new Error('compaction expected')
      const retained = await retainedCompaction(
        { ...s, opened, history: s.port.history },
        message.ok,
      )
      let armed = false
      let injected = false
      const intercepted: SqlStorage = {
        ...s.storage,
        async commit(input, options) {
          if (
            armed &&
            input.commands.some(
              command =>
                command.participant === 'execution-record' && command.facts['intent'] === 'publish',
            )
          ) {
            armed = false
            injected = true
            if (fault === 'applied')
              expect((await s.storage.commit(input, options)).kind).toBe('committed')
            return {
              kind: 'unknown',
              identity: input.identity,
              diagnostic: 'lost joint adoption response',
            }
          }
          return s.storage.commit(input, options)
        },
      }
      const journal =
        fault === null
          ? s.fresh().journal
          : createSessionLogJournal<string>({
              storage: intercepted,
              tenantDomainLookup: { lookup: async () => ({ kind: 'ready', domain: s.domain }) },
              sessionAccessCheck: {
                check: async () => ({ kind: 'allowed', evidence: retained.receipt.evidence }),
              },
              combination: s.combination,
            }).forSession(s.access).journal
      const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
      expect(loaded.results).toEqual([
        expect.objectContaining({
          consumption: retained.value.consumption,
          result: {
            producer: { kind: 'compaction', task: retained.value.task },
            version: retained.value.result.version,
            delivery: null,
            source: retained.value.result.evidence,
          },
          custody: retained.value.received,
        }),
      ])
      const request = {
        ...s.access,
        execution: s.execution,
        operation: operation('adopt'),
        authority: opened.authority,
        expected: retained.receipt.revision,
        checkpoint: retained.checkpoint,
        state: { kind: 'advancing' as const },
        events: [],
        effects: [],
        replyAdmission: null,
        handoff: null,
        finish: null,
        caller: {
          kind: 'context-transition' as const,
          value: retained.value,
          admission: retained.value.admission,
        },
      }
      const stale = await journal.commit({
        ...request,
        operation: operation('stale'),
        caller: { ...request.caller, value: { ...retained.value, epoch: 'stale' } },
      })
      expect(stale, JSON.stringify(stale)).toHaveProperty('failure.kind', 'changed')
      armed = fault !== null
      const first = await journal.commit(request)
      if (fault !== null) {
        expect(injected).toBe(true)
        expect(first).toHaveProperty('failure.kind', 'commit-unknown')
      }
      const adopted = fault === null ? ok(first) : ok(await s.fresh().journal.commit(request))
      const recovered = s.fresh().journal
      expect(ok(await recovered.commit(request))).toEqual(adopted)
      const state = ok(await recovered.load({ ...s.access, execution: s.execution }))
      expect(
        state.results,
        'the adopted result is processed and released, so it left the snapshot',
      ).toEqual([])
      const sessionState = ok(await s.port.readWork(s.access))
      expect(sessionState.run).toMatchObject({
        kind: 'active',
        execution: {
          execution: s.execution,
          revision: adopted.revision,
        },
      })
      expect(sessionState.executions?.at(-1)?.execution).toMatchObject({
        execution: s.execution,
        revision: adopted.revision,
      })
      expect(
        await recovered.commit({
          ...request,
          expected: state.revision,
          operation: operation('again'),
        }),
      ).toHaveProperty('failure.kind', 'invalid')
      const after = ok(
        await s.port.history.readModelView({
          ...s.access,
          basis: null,
          after: null,
          pageBytes: 100000,
        }),
      )
      if (after.kind !== 'page') throw new Error('new model view expected')
      expect(after.basis.epoch).not.toBe(page.basis.epoch)
      expect(after.rows.map(row => row.message)).toEqual([
        ...page.rows.map(row => row.message),
        message.ok,
      ])
      if (name === 'compaction-adoption-sql') {
        const entries = ok(
          await s
            .fresh()
            .entries.read({ ...s.access, execution: s.execution, after: null, limit: 10 }),
        )
        expect(entries.items).not.toHaveLength(0)
        const source = entries.items.find(item => item.entry.kind === 'received')?.entry
        if (source?.kind !== 'received') throw new Error('a received entry is required')
        const material = ok(
          await s.fresh().materials.read({ ...s.access, source: source.material }),
        )
        const current = ok(await recovered.load({ ...s.access, execution: s.execution }))
        ok(
          await recovered.commit({
            ...request,
            operation: operation('continue-after-compaction'),
            expected: current.revision,
            caller: { kind: 'none' },
            checkpoint: {
              ...current.checkpoint,
              position: 'R0',
              compaction: null,
              requestPreparation: null,
            },
          }),
        )
        expect(
          ok(
            await s
              .fresh()
              .entries.read({ ...s.access, execution: s.execution, after: null, limit: 10 }),
          ),
        ).toEqual(entries)
        expect(
          ok(await s.fresh().materials.read({ ...s.access, source: source.material })),
        ).toEqual(material)
      }
    } finally {
      await s.close()
    }
  },
)
