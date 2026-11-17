import { contextEpochOf } from '../src/cordis/history-epoch.ts'
import { expect, it } from 'vitest'
import { decodeActionId } from '@omne-harness/agent-contract'
import { sampleCompactionInput } from '@omne-harness/agent-contract/testing'
import { succeed } from '@omne-harness/operation-result'
import { judgeMessage, parseRecordEntryRef, projectMessage } from '@omne-harness/message'
import { operationId } from '@omne-harness/session-contract/testing'
import { unpackText } from '@omne-harness/sql-contract/worker'
import {
  createSqlCompactionInputs,
  type SessionCompactionInputsOptions,
} from '../src/cordis/compaction-inputs-sql.ts'
import { sqlScene, type SqlScene } from './fixtures/sql-scene.ts'
import { evidence, ok } from './fixtures/common-journal.ts'

function options(s: SqlScene): SessionCompactionInputsOptions<string> {
  return {
    storage: s.storage,
    combination: s.combination,
    tenantDomainLookup: { lookup: async () => ({ kind: 'ready', domain: s.domain }) },
    sessionAccessCheck: { check: async () => ({ kind: 'allowed', evidence: s.grant }) },
    sessionOf: async () => succeed(s.access.session),
  }
}

async function inputOf(s: SqlScene) {
  const { outputMessageId: _allocatedByHolder, ...sample } = sampleCompactionInput()
  const page = ok(
    await s.port.history.readModelView({
      ...s.access,
      basis: null,
      after: null,
      pageBytes: 100000,
    }),
  )
  if (page.kind !== 'page' || page.rows.length === 0)
    throw new Error('expected model-visible input')
  const context = ok(
    await s.port.history.readCompactionContext({ ...s.access, basis: page.basis, coverTo: null }),
  )
  if (context.kind !== 'context') throw new Error('expected current history evidence')
  const { value } = context
  const entries = page.rows.flatMap(row => {
    const ref = parseRecordEntryRef(row.entry)
    if (ref === null) throw new Error('missing history identity')
    const projected = projectMessage(row.message, 'toModel')
    return projected === null
      ? []
      : [
          {
            ref,
            sequence: String(BigInt(row.seq) - 1n),
            message: projected.message,
            represented: [projected.message],
          },
        ]
  })
  const visible = new Set(entries.map(entry => entry.ref))
  const epoch = contextEpochOf(page.basis.epoch)
  if (epoch === undefined) throw new Error('fixture epoch')
  return {
    ...sample,
    history: {
      ...sample.history,
      epoch,
      origin: value.origin,
      upper: value.covered.at(-1)!.ref,
      base: value.base,
      entries,
      logOrder: [...value.covered, ...value.after].map(row => row.ref),
      protected: value.open.filter(ref => visible.has(ref)),
      barriers: value.open.filter(ref => !visible.has(ref)),
    },
  }
}

it.each(['compaction-input-sql', 'compaction-input-%0a'])(
  'recovers frozen input and checks access for %s',
  async name => {
    const s = await sqlScene(name, { storage: 'real' })
    try {
      const value = await inputOf(s)
      const configuration = options(s)
      const ref = ok(
        await createSqlCompactionInputs(configuration).freeze({
          ...s.access,
          execution: s.execution,
          preparation: ok(decodeActionId('prepare')),
          value,
        }),
      )
      const cold = createSqlCompactionInputs(configuration)
      expect(ok(await cold.read({ ...s.access, reference: ref })).history).toEqual(value.history)
      const denied = createSqlCompactionInputs({
        ...configuration,
        sessionAccessCheck: { check: async () => ({ kind: 'denied' }) },
      })
      expect(await denied.read({ ...s.access, reference: ref })).toHaveProperty(
        'failure.kind',
        'denied',
      )
    } finally {
      await s.close()
    }
  },
)

it('refuses an incomplete current history even when every supplied message is authentic', async () => {
  const s = await sqlScene('compaction-input-incomplete')
  try {
    const message = judgeMessage({
      ...sampleCompactionInput().history.entries[0]!.message,
      role: 'system_reminder',
    })
    if (!('ok' in message)) throw new Error('expected reminder')
    const snapshot = ok(await s.port.readWork(s.access))
    ok(
      await s.port.commit({
        access: s.access,
        command: {
          kind: 'commitDerived',
          input: {
            ...s.access,
            operation: operationId('reminder'),
            expected: snapshot.revision,
            value: { kind: 'context-reminder', message: message.ok, source: evidence('reminder') },
          },
        },
        guards: [],
      }),
    )
    const value = await inputOf(s)
    const omitted = {
      ...value,
      history: { ...value.history, entries: value.history.entries.slice(0, -1) },
    }
    expect(
      await createSqlCompactionInputs(options(s)).freeze({
        ...s.access,
        execution: s.execution,
        preparation: ok(decodeActionId('prepare')),
        value: omitted,
      }),
    ).toHaveProperty('failure.kind', 'invalid')
  } finally {
    await s.close()
  }
})

it('recognizes a lost publication receipt under its original operation', async () => {
  const s = await sqlScene('compaction-input-unknown')
  try {
    const value = await inputOf(s)
    s.controls?.loseNextReply()
    const ref = ok(
      await createSqlCompactionInputs(options(s)).freeze({
        ...s.access,
        execution: s.execution,
        preparation: ok(decodeActionId('prepare')),
        value,
      }),
    )
    expect(
      ok(await createSqlCompactionInputs(options(s)).read({ ...s.access, reference: ref })).history,
    ).toEqual(value.history)
  } finally {
    await s.close()
  }
})

it('recovers the model-visible projection from original log references without exposing private blocks', async () => {
  const s = await sqlScene('compaction-input-visibility')
  try {
    const sample = sampleCompactionInput().history.entries[0]!.message
    const message = judgeMessage({
      ...sample,
      role: 'system_reminder',
      blocks: [
        ...sample.blocks,
        {
          kind: 'text',
          id: 'private',
          visibility: { toHuman: true, toModel: false },
          text: 'private log annotation',
        },
      ],
    })
    if (!('ok' in message)) throw new Error('fixture reminder')
    const snapshot = ok(await s.port.readWork(s.access))
    ok(
      await s.port.commit({
        access: s.access,
        command: {
          kind: 'commitDerived',
          input: {
            ...s.access,
            operation: operationId('visible-reminder'),
            expected: snapshot.revision,
            value: { kind: 'context-reminder', message: message.ok, source: evidence('reminder') },
          },
        },
        guards: [],
      }),
    )
    const value = await inputOf(s)
    const ref = ok(
      await createSqlCompactionInputs(options(s)).freeze({
        ...s.access,
        execution: s.execution,
        preparation: ok(decodeActionId('prepare')),
        value,
      }),
    )
    const cold = ok(
      await createSqlCompactionInputs(options(s)).read({ ...s.access, reference: ref }),
    )
    expect(cold.history).toEqual(value.history)
    expect(JSON.stringify(cold)).not.toContain('private log annotation')
    const original = ok(
      await s.port.history.readModelView({
        ...s.access,
        basis: null,
        after: null,
        pageBytes: 100000,
      }),
    )
    expect(JSON.stringify(original)).toContain('private log annotation')
  } finally {
    await s.close()
  }
})

it('freezes references to existing history and recovers them after the current epoch has moved', async () => {
  const s = await sqlScene('compaction-input-references')
  try {
    const value = await inputOf(s)
    const ref = ok(
      await createSqlCompactionInputs(options(s)).freeze({
        ...s.access,
        execution: s.execution,
        preparation: ok(decodeActionId('prepare')),
        value,
      }),
    )
    const stored =
      s.controls?.select('SELECT payload FROM sl_blob').rows.map(row => {
        const cell = row[0]
        if (!(cell instanceof Uint8Array)) throw new Error('expected packed body')
        return unpackText(cell)
      }) ?? []
    const body = value.history.entries[0]!.message.blocks.find(block => block.kind === 'text')
    if (body?.kind !== 'text') throw new Error('expected fixture text')
    expect(stored.some(payload => payload.includes(body.text))).toBe(false)
    s.controls?.select("UPDATE sl_journal SET epoch = 'later-epoch'")
    expect(
      ok(await createSqlCompactionInputs(options(s)).read({ ...s.access, reference: ref })).history,
    ).toEqual(value.history)
  } finally {
    await s.close()
  }
})
