import { describe, expect, it } from 'vitest'
import { assistantMessage } from '@omne-harness/session-contract/testing'
import {
  evidence,
  ok,
  operation,
  scene,
  submitInput,
  type SceneQualification,
} from './fixtures/common-journal.ts'
import { accept, take, type Scene } from './fixtures/progression.ts'
import { rowData } from '../src/testing/session-values.ts'

const entries = (s: Scene) => s.backend.controls.entriesOf(s.access.tenant, s.access.session)
const delivered = (s: Scene) =>
  entries(s)
    .filter(row => row.kind === 'message.delivered')
    .map(row => ({ id: row.id, input: rowData(row)['input'] }))

async function viewOf(s: Scene) {
  const view = ok(
    await s.backend.transactions.history.readModelView({
      ...s.access,
      basis: null,
      after: null,
      pageBytes: 100_000,
    }),
  )
  if (view.kind !== 'page') throw new Error('a page of the model view is expected')
  return view.rows.map(row => row.entry)
}

async function takeRequest(s: Scene, name: string) {
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  const page = ok(
    await s.view.journal.inputs({
      ...s.access,
      execution: s.execution,
      watermark: loaded.inputWatermark,
    }),
  )
  return {
    loaded,
    request: {
      ...s.access,
      execution: s.execution,
      operation: operation(name),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: { ...loaded.checkpoint, inputBatch: page.batch },
      state: { kind: 'advancing' as const },
      events: [{ kind: 'input-taken' as const, batch: page.batch }],
      effects: [],
      caller: { kind: 'none' as const },
      replyAdmission: null,
      handoff: null,
      finish: null,
    },
  }
}

async function reply(s: Scene, name: string) {
  const loaded = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
  const message = assistantMessage(name)
  return ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`reply-${name}`),
      authority: s.opened.authority,
      expected: loaded.revision,
      checkpoint: loaded.checkpoint,
      state: { kind: 'advancing' },
      events: [{ kind: 'message', message, source: evidence(`admission-${name}`) }],
      effects: [],
      caller: {
        kind: 'message',
        message,
        source: evidence(`source-${name}`),
        admission: evidence(`admission-${name}`),
      },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
}

describe('the step that takes a batch delivers it to the model view', () => {
  it('an accepted input is not in the model view; the take puts it there in the same commit (TakenShown, ShownTaken)', async () => {
    const s = await scene('delivery-take')
    expect(await viewOf(s)).toEqual([])
    expect(delivered(s)).toEqual([])

    await take(s)

    const written = delivered(s)
    expect(written.map(row => row.input)).toEqual([String(s.initial.id)])
    expect(await viewOf(s)).toEqual(written.map(row => row.id))
  })

  it('an input submitted while the model replies is delivered after the reply, by the step that takes it (AskHasNews)', async () => {
    const s = await scene('delivery-late')
    await take(s)
    const late = await accept(s, 'late-input')
    ok(
      await s.view.journal.submit(
        submitInput(s.access, s.execution, operation('submit-late'), late),
      ),
    )
    expect(delivered(s)).toHaveLength(1)

    await reply(s, 'answer')
    await take(s, 'take-late')

    const kinds = entries(s)
      .map(row => row.kind)
      .filter(kind => kind === 'message.delivered' || kind === 'message.assistant')
    expect(kinds).toEqual(['message.delivered', 'message.assistant', 'message.delivered'])
    expect(delivered(s).map(row => row.input)).toEqual([String(s.initial.id), 'late-input'])
    expect((await viewOf(s)).at(-1)).toBe(delivered(s).at(-1)!.id)
  })

  it('when the Session refuses the delivery the step does not begin', async () => {
    const qualification: SceneQualification = { agent: true, session: true }
    const s = await scene('delivery-refused', undefined, qualification)
    const { loaded, request } = await takeRequest(s, 'take-refused')
    qualification.session = false

    expect(await s.view.journal.commit(request)).toMatchObject({ failure: { kind: 'denied' } })

    qualification.session = true
    const after = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))
    expect(after.revision).toBe(loaded.revision)
    expect(after.checkpoint.inputBatch).toEqual(loaded.checkpoint.inputBatch)
    expect(delivered(s)).toEqual([])
    expect(await viewOf(s)).toEqual([])
  })
})
