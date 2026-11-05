// The input range of a batch that an execution took, when the in-process index of a Journal copy
// is rebuilt from the durable records (`takenRange` of the Journal core). A batch with inputs gets
// its range from the position of its first input; an empty batch, which names no input, gets it
// from the range its identity names, and only when that identity is one this execution issued: the
// identity of the form `<execution>/batch/<from>-<to>` with from = to, within the inputs the
// execution accepted. Any other identity leaves the range unknown, and the load of that copy then
// fails with `original input batch range is unavailable` instead of reading inputs from a range
// nobody issued. The durable record is rewritten at its read, the way a damaged or foreign record
// would reach a reader; the Journal that wrote it never wrote such an identity.
import { afterEach, describe, expect, it } from 'vitest'
import { EXECUTION_RECORD_HANDLERS } from '@omne-harness/session-storage-sql/participants'
import type { JsonValue } from '@omne-harness/sql-contract'
import { ok, operation } from './fixtures/common-journal.ts'
import { handed, sqlScene, type SqlScene } from './fixtures/sql-scene.ts'

const scenes: SqlScene[] = []
afterEach(async () => {
  for (const s of scenes.splice(0)) await s.close()
})

type Json = { [key: string]: unknown }

/**
 * A page of the facts of the session with the empty batch of the execution named `id`: the
 * `step.begun` fact of the input-taken event and the `cursor.moved` fact of the checkpoint member.
 */
function renamed(output: JsonValue, id: string): JsonValue {
  const copy = structuredClone(output) as {
    batches: { facts: { kind: string; body: Json }[] }[]
  }
  for (const fact of copy.batches.flatMap(batch => batch.facts)) {
    // A family row holds its fact as text; the rewrite decodes it and writes it back the same way.
    const text = typeof fact.body === 'string'
    const body = (text ? JSON.parse(fact.body as unknown as string) : fact.body) as Json
    if (fact.kind === 'step.begun') {
      const batch = body['batch'] as { id: string; ordered: unknown[] } | undefined
      if (batch?.ordered.length === 0) batch.id = id
    }
    if (fact.kind === 'cursor.moved') {
      // The cursor member names the batch by its identity.
      const members = body['members'] as Json
      if (typeof members['inputBatch'] === 'string') members['inputBatch'] = id
    }
    fact.body = (text ? JSON.stringify(body) : body) as Json
  }
  return copy as unknown as JsonValue
}

/** A session whose execution took its first input and then took nothing (an empty batch). */
async function afterEmptyTake(name: string) {
  const s = await sqlScene(name)
  scenes.push(s)
  const journal = s.view.journal
  const opened = ok(await journal.open(s.openInput))
  ok(await handed(s, String(s.initial.id), opened.receipt.evidence))
  const take = async (label: string) => {
    const loaded = ok(await journal.load({ ...s.access, execution: s.execution }))
    const authority = loaded.executionAttachment
    if (authority === null) throw new Error('an active attachment is expected')
    const page = ok(
      await journal.inputs({
        ...s.access,
        execution: s.execution,
        watermark: loaded.inputWatermark,
      }),
    )
    return {
      page,
      commit: async () =>
        ok(
          await journal.commit({
            ...s.access,
            execution: s.execution,
            operation: operation(label),
            authority,
            expected: loaded.revision,
            checkpoint: { ...loaded.checkpoint, inputBatch: page.batch },
            state: { kind: 'advancing' },
            events: [{ kind: 'input-taken', batch: page.batch }],
            effects: [],
            caller: { kind: 'none' },
            replyAdmission: null,
            handoff: null,
            finish: null,
          }),
        ),
    }
  }
  await (await take('take-input')).commit()
  const empty = await take('take-nothing')
  expect(empty.page.batch.ordered).toHaveLength(0)
  await empty.commit()
  return s
}

const load = (s: SqlScene) => s.fresh().journal.load({ ...s.access, execution: s.execution })

describe('the range of an empty batch in a rebuilt Journal copy', () => {
  it('is the range its own identity names: a copy rebuilt from the durable records loads', async () => {
    const s = await afterEmptyTake('taken-range-own')
    ok(await load(s))
  })

  it.each([
    { name: 'not of the form execution/batch/from-to', id: (e: string) => `${e}/batch/first` },
    { name: 'a range with from and to apart', id: (e: string) => `${e}/batch/1-0` },
    { name: 'a range beyond the accepted inputs', id: (e: string) => `${e}/batch/9-9` },
    {
      name: 'an identity of another execution that names a range this one accepted',
      id: () => 'another-execution/batch/1-1',
    },
  ])('$name leaves the range unknown, and the load still fails', async ({ id }) => {
    const s = await afterEmptyTake('taken-range-foreign')
    const bad = id(String(s.execution))
    s.rewriteReads.current = (request, answer) =>
      request.handler === EXECUTION_RECORD_HANDLERS.facts && answer.kind === 'read'
        ? { ...answer, output: renamed(answer.output, bad) }
        : answer
    await expect(load(s)).rejects.toThrow('original input batch range is unavailable')
  })
})
