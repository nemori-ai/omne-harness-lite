import { afterEach, expect, it } from 'vitest'
import {
  createHitlSqlOperations,
  independentRequestCommands,
} from '@omne-harness/human-intervention-local'
import { digest, canonical, operationKey } from '../src/encoding.ts'
import { IndependentControlSchema, InboxEntrySchema } from '../src/independent-schema.ts'
import { RequestRecordSchema } from '../src/request-schema.ts'
import { parseJson } from '../src/relational-values.ts'
import { inspectRelations } from '../verification/relations.ts'
import { legacyCopy, legacyFixture, database } from './legacy-fixture.ts'
import { openWorld } from './world.ts'

const worlds: Awaited<ReturnType<typeof openWorld>>[] = []
afterEach(async () => {
  await Promise.all(worlds.splice(0).map(world => world.close()))
})
async function open(root: string) {
  const world = await openWorld({ root })
  worlds.push(world)
  return world
}

it('upgrades real legacy waiting states and retains original operations, decisions and receipts', async () => {
  const { root } = legacyCopy(),
    world = await open(root)
  const operations = createHitlSqlOperations({
    storage: world.storage,
    domain: world.combination,
    ...world.combination,
  })
  for (const entry of legacyFixture.cases) {
    if (entry.registered?.kind !== 'registered') continue
    const query = await world.storage.read({
      domain: world.combination,
      handler: 'hitl.request-read',
      protocol: 'hitl-sql/2',
      requestKey: entry.scenario,
      input: { kind: 'request', ref: entry.registered.requestRef, actorRef: 'owner' },
    })
    expect(query.kind).toBe('read')
    if (query.kind !== 'read') throw new Error('request read failed')
    const request = RequestRecordSchema.parse(query.output)
    expect(request.cards.map(card => card.question)).toEqual(entry.registration.questions)
    for (const decision of entry.decisions) {
      expect(
        await operations.inspect({
          operationRef: decision.input.command.operation,
          inputDigest: digest(decision.input),
        }),
      ).toMatchObject({ kind: 'committed', result: decision.result })
      if (decision.input.method === 'submitReply') {
        const command = decision.input.command
        const card = request.cards.find(card => card.ref.cardId === command.cardRef.cardId)
        expect(card).toMatchObject({
          kind: 'decided',
          decision: { reply: decision.input.command.reply },
        })
      }
    }
    expect(
      await operations.inspect({
        operationRef: entry.registration.operation,
        inputDigest: digest({ method: 'registerRequest', command: entry.registration }),
      }),
    ).toMatchObject({ kind: 'committed', result: entry.registered })
    for (const receipt of entry.receipts) {
      expect(
        await operations.inspect({
          operationRef: receipt.command.operation,
          inputDigest: digest({ kind: 'consume', command: receipt.command }),
        }),
      ).toMatchObject({ kind: 'committed', result: receipt.result })
    }
  }
  expect((await operations.inspect(legacyFixture.sealed)).kind).toBe('not-committed')
  const prepared = legacyFixture.cases.find(entry => entry.scenario === 'prepared')
  if (!prepared) throw new Error('missing prepared fixture')
  const committed = await world.storage.commit({
    identity: {
      ...world.combination,
      operation: 'hitl.command',
      protocolVersion: '2',
      operationKey: operationKey(prepared.registration.operation),
    },
    combinationVersion: world.combination.combinationVersion,
    manifestDigest: world.combination.manifestDigest,
    commands: independentRequestCommands(
      { method: 'registerRequest', command: prepared.registration },
      prepared.registration.origin.wait,
    ),
  })
  expect(committed.kind).toBe('committed')
  await world.close()
  const db = database(root)
  try {
    expect(inspectRelations(db)).toEqual([])
    expect(
      db.prepare("SELECT name FROM sqlite_schema WHERE name='hi_wait_hitl_export_v2'").all(),
    ).toEqual([])
  } finally {
    db.close()
  }
  await open(root)
})

type Database = ReturnType<typeof database>
function mutateRequest(
  db: Database,
  edit: (record: ReturnType<typeof RequestRecordSchema.parse>) => unknown,
) {
  const row = db
    .prepare(
      "SELECT request_id,record FROM hi_requests WHERE record LIKE '%partial-answer%' LIMIT 1",
    )
    .get()
  if (!row) throw new Error('missing request fixture')
  db.prepare('UPDATE hi_requests SET record=? WHERE request_id=?').run(
    canonical(edit(RequestRecordSchema.parse(parseJson(row.record)))),
    String(row.request_id),
  )
}
const corruptions: ReadonlyArray<{ name: string; corrupt: (db: Database) => void }> = [
  {
    name: 'tampered original registration operation',
    corrupt(db) {
      const row = db
        .prepare(
          "SELECT wait_key,record FROM hi_wait_controls WHERE record LIKE '%prepared-register%' LIMIT 1",
        )
        .get()
      if (!row) throw new Error('missing control')
      const state = IndependentControlSchema.parse(parseJson(row.record))
      // Use an active registration to force the original-owner/request digest comparison.
      const active = db
        .prepare(
          "SELECT wait_key,record FROM hi_wait_controls WHERE record LIKE '%active-register%' LIMIT 1",
        )
        .get()
      if (!active) throw new Error('missing active control')
      const current = IndependentControlSchema.parse(parseJson(active.record))
      db.prepare('UPDATE hi_wait_controls SET record=? WHERE wait_key=?').run(
        canonical({
          ...current,
          preparation: {
            ...current.preparation,
            registration: {
              ...current.preparation.registration,
              operation: state.preparation.registration.operation,
            },
          },
        }),
        String(active.wait_key),
      )
    },
  },
  {
    name: 'changed decision body with unchanged identity',
    corrupt(db) {
      mutateRequest(db, request => ({
        ...request,
        cards: request.cards.map(card =>
          card.kind === 'decided'
            ? {
                ...card,
                decision: { ...card.decision, reply: { kind: 'text', text: 'substituted' } },
              }
            : card,
        ),
      }))
    },
  },
  {
    name: 'omitted decision from owner custody',
    corrupt(db) {
      db.prepare(
        "DELETE FROM hi_wait_inbox WHERE sequence=(SELECT sequence FROM hi_wait_inbox WHERE record LIKE '%partial-answer%' LIMIT 1)",
      ).run()
    },
  },
  {
    name: 'extra decision in owner custody',
    corrupt(db) {
      const row = db
        .prepare(
          "SELECT wait_key,record FROM hi_wait_inbox WHERE record LIKE '%partial-answer%' LIMIT 1",
        )
        .get()
      if (!row) throw new Error('missing inbox')
      const entry = InboxEntrySchema.parse(parseJson(row.record)),
        ref = {
          ...entry.decision.ref,
          card: { ...entry.decision.ref.card, cardId: 'second' },
          decisionId: 'extra-decision',
        }
      db.prepare('INSERT INTO hi_wait_inbox(wait_key,decision_key,record) VALUES(?,?,?)').run(
        String(row.wait_key),
        digest(ref),
        canonical({ ...entry, decision: { ...entry.decision, ref } }),
      )
    },
  },
  {
    name: 'changed question breaks the original registration digest',
    corrupt(db) {
      mutateRequest(db, request => ({
        ...request,
        cards: request.cards.map(card => ({
          ...card,
          question: { ...card.question, description: 'substituted question' },
        })),
      }))
    },
  },
  {
    name: 'duplicate card decision in owner custody',
    corrupt(db) {
      const row = db
        .prepare(
          "SELECT wait_key,record FROM hi_wait_inbox WHERE record LIKE '%partial-answer%' LIMIT 1",
        )
        .get()
      if (!row) throw new Error('missing inbox')
      const entry = InboxEntrySchema.parse(parseJson(row.record)),
        ref = { ...entry.decision.ref, decisionId: 'duplicate-card-decision' }
      db.prepare('INSERT INTO hi_wait_inbox(wait_key,decision_key,record) VALUES(?,?,?)').run(
        String(row.wait_key),
        digest(ref),
        canonical({ ...entry, decision: { ...entry.decision, ref } }),
      )
    },
  },
  {
    name: 'lost receipt with ready checkpoint',
    corrupt(db) {
      const row = db
        .prepare(
          "SELECT wait_key,record FROM hi_wait_controls WHERE record LIKE '%unacked-register%' LIMIT 1",
        )
        .get()
      if (!row) throw new Error('missing receipts')
      const state = IndependentControlSchema.parse(parseJson(row.record))
      db.prepare('UPDATE hi_wait_controls SET record=? WHERE wait_key=?').run(
        canonical({ ...state, receipts: state.receipts.slice(1) }),
        String(row.wait_key),
      )
    },
  },
]
for (const { name, corrupt } of corruptions)
  it(`rolls the entire upgrade back for ${name}`, async () => {
    const { root } = legacyCopy(),
      db = database(root)
    corrupt(db)
    const old = db.prepare('SELECT record FROM hi_requests ORDER BY sequence').all()
    const controls = db.prepare('SELECT record FROM hi_wait_controls ORDER BY wait_key').all()
    db.close()
    await expect(open(root)).rejects.toThrow()
    const after = database(root)
    try {
      expect(after.prepare('SELECT record FROM hi_requests ORDER BY sequence').all()).toEqual(old)
      expect(after.prepare('SELECT record FROM hi_wait_controls ORDER BY wait_key').all()).toEqual(
        controls,
      )
      expect(
        after.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'hi_%_v2'").all(),
      ).toEqual([])
    } finally {
      after.close()
    }
  })

it('rolls back a verify failure after relational adoption and retries without duplicate rows', async () => {
  const { createHash } = await import('node:crypto')
  const { readFileSync } = await import('node:fs')
  const { WAIT_FINAL_MIGRATION } = await import('../src/wait-schema.ts')
  const { TERMINAL_RELATIONAL_MIGRATION } = await import('../src/relational-migrations.ts')
  const { root } = legacyCopy(),
    fixture = new URL('./fixtures/migration-failure.mjs', import.meta.url)
  await expect(
    openWorld({
      root,
      extraMaterials: {
        participants: [],
        readHandlers: [],
        migrations: [
          {
            owner: 'hitl.requests',
            id: 'fixture-after-relational-adoption',
            moduleUrl: fixture.href,
            checksum: createHash('sha256').update(readFileSync(fixture)).digest('hex'),
            requires: [WAIT_FINAL_MIGRATION, TERMINAL_RELATIONAL_MIGRATION],
          },
        ],
      },
    }),
  ).rejects.toThrow()
  const old = database(root)
  try {
    expect(old.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'hi_%_v2'").all()).toEqual(
      [],
    )
    expect(old.prepare('SELECT count(*) AS n FROM hi_requests').get()?.n).toBe(7)
  } finally {
    old.close()
  }
  const world = await open(root)
  await world.close()
  const upgraded = database(root)
  try {
    expect(inspectRelations(upgraded)).toEqual([])
    expect(upgraded.prepare('SELECT count(*) AS n FROM hi_requests_v2').get()?.n).toBe(7)
  } finally {
    upgraded.close()
  }
})
