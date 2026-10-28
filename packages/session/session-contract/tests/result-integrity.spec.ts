import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import {
  reduce,
  type BatchId,
  type CallBinding,
  type ConsumptionId,
  type HistoryEntry,
  type Participation,
  type SessionCommand,
  type WorkSnapshot,
} from '@omne-harness/session-contract'
import {
  evidence,
  operationId,
  succeeded,
  refused,
  assistantMessage,
} from '@omne-harness/session-contract/testing'
import { encodeEntry, type SessionEntry } from '../src/entries.ts'
import { open, participation, scene } from './scene.ts'

async function callScene(external = false) {
  const s = await open()
  const { run, advance } = await s.active()
  const binding: CallBinding = {
    producer: { kind: 'tool', call: 'original-call' },
    action: 'action',
    consumer: { owner: 'session', work: 'work', position: 'original-position', purpose: 'action' },
    request: evidence('request'),
    initiatingAttempt: external ? null : advance.attempt,
  }
  const id = 'original-consumption' as ConsumptionId
  const consumption = external
    ? succeeded(
        await s.commit({
          kind: 'bindExternalCall',
          input: {
            ...s.base,
            operation: operationId('bind'),
            expected: (await s.read()).revision,
            binding: { ...binding, initiatingAttempt: null },
            qualification: evidence('qualified'),
          },
        }),
        'external bind',
      ).consumption
    : id
  if (!external)
    succeeded(
      await s.port.controls.project(
        {
          ...s.base,
          run: run.run,
          execution: run.execution.execution,
          revision: '1',
          sequence: '1',
          source: evidence('call'),
          consequences: [
            { kind: 'call', consumption, binding },
            {
              kind: 'waiting',
              waiting: [{ kind: 'producer', binding, position: binding.consumer.position }],
            },
          ],
        },
        operationId('call'),
      ),
      'call',
    )
  const result = {
    producer: binding.producer,
    version: '1',
    delivery: 'delivery',
    source: evidence('result'),
  }
  const preserve = (
    operation: string,
    custody = evidence('custody'),
    part: Participation | null = null,
  ) =>
    s.commit({
      kind: 'preserveResult',
      input: {
        ...s.base,
        operation: operationId(operation),
        consumption,
        result,
        custody,
        participation: part,
      },
    })
  const process = (
    operation: string,
    part = participation(run.execution.execution, 'processed'),
    proof = evidence('processed'),
  ) =>
    s.commit({
      kind: 'completeConsumption',
      input: {
        ...s.base,
        operation: operationId(operation),
        participation: part,
        completion: { consumption, result, completion: proof },
      },
    })
  const processExternal = async (
    operation: string,
    position = binding.consumer.position,
    processing = evidence('processed'),
  ) =>
    s.commit({
      kind: 'completeExternalConsumption',
      input: {
        ...s.base,
        operation: operationId(operation),
        expected: (await s.read()).revision,
        qualification: evidence('qualified'),
        completion: { consumption, result, position, processing, message: null },
      },
    })
  const cancel = async () =>
    succeeded(
      await s.commit({
        kind: 'control',
        input: {
          ...s.base,
          operation: operationId('cancel'),
          intent: { kind: 'cancel-run', run: run.run, urgency: 'force' },
        },
      }),
      'cancel',
    )
  const release = (operation: string) =>
    s.commit({
      kind: 'receive',
      input: {
        ...s.base,
        operation: operationId(operation),
        fact: { kind: 'release', consumption, result, source: evidence('confirmed') },
      },
    })
  return {
    ...s,
    run,
    binding,
    consumption,
    result,
    preserve,
    process,
    processExternal,
    cancel,
    release,
  }
}

function committedBatch(snapshot: WorkSnapshot, ...entries: SessionEntry[]) {
  const revision = String(BigInt(snapshot.revision) + 1n) as WorkSnapshot['revision']
  return {
    revision,
    entries: entries.map((entry, index) => ({
      ...encodeEntry(entry, { owner: 'session', via: 'direct', source: evidence('replay') }),
      revision,
      id: `replay-${index}` as HistoryEntry['id'],
    })),
  }
}

function replay(snapshot: WorkSnapshot, entry: SessionEntry) {
  return reduce(snapshot, committedBatch(snapshot, entry))
}

describe('original result responsibility', () => {
  it('processing requires the original execution, and a refused commit leaves waiting intact', async () => {
    const s = await callScene()
    const before = await s.read()
    expect(
      refused(await s.process('foreign', participation('foreign', 'processed')), 'foreign').kind,
    ).toBe('stale-advance')
    expect(await s.read()).toEqual(before)
    succeeded(await s.process('valid'), 'valid')
    expect((await s.read()).waiting).toEqual([])
    expect((await s.read()).consumptions[0]?.results[0]?.completion).toEqual(evidence('processed'))
  })
  it('Run and external completion cannot substitute for one another or another position', async () => {
    const s = await callScene(true)
    expect(refused(await s.process('wrong-path'), 'Run path').kind).toBe('invalid')
    expect(refused(await s.processExternal('wrong-position', 'foreign'), 'position').kind).toBe(
      'invalid',
    )
    succeeded(await s.processExternal('external'), 'external')
    const internal = await callScene()
    expect(refused(await internal.processExternal('wrong-path'), 'external path').kind).toBe(
      'invalid',
    )
  })
  for (const state of ['cancelled', 'archived', 'successor'] as const)
    it(`revoked processing is refused while ${state} custody updates only the historical execution`, async () => {
      const s = await callScene()
      if (state === 'archived') await s.control('archive')
      else await s.cancel()
      if (state === 'successor') await s.start('successor')
      const before = await s.read()
      expect(refused(await s.process('late-processed'), 'late').kind).toBe(
        state === 'archived' ? 'archived' : state === 'successor' ? 'stale-advance' : 'terminal',
      )
      expect(await s.read()).toEqual(before)
      if (before.run.kind === 'active') {
        expect(
          refused(
            await s.process(
              'successor-processed',
              participation(before.run.execution.execution, 'processed'),
            ),
            'successor',
          ).kind,
        ).toBe('invalid')
        expect(await s.read()).toEqual(before)
      }
      const part = {
        ...participation(s.run.execution.execution, 'custody'),
        written: '5',
        handover: evidence('late-custody'),
      }
      succeeded(await s.preserve('late-custody', evidence('custody'), part), 'custody')
      const after = await s.read()
      expect(after.run).toEqual(before.run)
      expect(after.executions?.find(item => item.run === s.run.run)?.execution).toEqual({
        execution: s.run.execution.execution,
        revision: '5',
        evidence: part.handover,
        readThrough: '1',
      })
      expect(after.pending).toEqual(before.pending)
      expect(after.waiting).toEqual(before.waiting)
      expect(
        refused(
          await s.preserve(
            'foreign-custody',
            evidence('custody'),
            participation('foreign', 'custody'),
          ),
          'foreign',
        ).kind,
      ).toBe('invalid')
      expect(await s.read()).toEqual(after)
    })
  for (const joint of ['custody', 'processed'] as const)
    it(`${joint} advances both execution references and keeps the event cursor`, async () => {
      const s = await callScene()
      const part = {
        ...participation(s.run.execution.execution, joint),
        written: '5',
        handover: evidence('participation-5'),
      }
      succeeded(
        joint === 'custody'
          ? await s.preserve('participation', evidence('custody'), part)
          : await s.process('participation', part),
        'participation',
      )
      const snapshot = await s.read()
      const expected = {
        execution: s.run.execution.execution,
        revision: '5',
        evidence: part.handover,
        readThrough: '1',
      }
      expect(snapshot.run).toMatchObject({ kind: 'active', execution: expected })
      expect(snapshot.executions?.[0]?.execution).toEqual(expected)
      await s.cancel()
      expect((await s.read()).executions?.[0]?.execution).toEqual(expected)
    })
  for (const state of ['active', 'cancelled', 'successor'] as const)
    it(`reduce quarantines regressed custody in ${state} without publishing a batch prefix`, async () => {
      const s = await callScene()
      const high = {
        ...participation(s.run.execution.execution, 'custody'),
        written: '5',
        handover: evidence('commit5'),
      }
      succeeded(await s.preserve('high', evidence('custody'), high), 'high')
      if (state !== 'active') await s.cancel()
      if (state === 'successor') await s.start('successor')
      const before = await s.read()
      const original = structuredClone(before)
      const prefix = {
        kind: 'call.result-preserved',
        consumption: s.consumption,
        result: { ...s.result, version: '2' },
        custody: evidence('second-version'),
        participation: null,
      } satisfies SessionEntry
      const prefixOnly = replay(before, prefix)
      expect(prefixOnly.kind).toBe('reduced')
      if (prefixOnly.kind === 'reduced')
        expect(prefixOnly.snapshot.consumptions[0]?.results).toHaveLength(2)
      const batch = committedBatch(before, prefix, {
        kind: 'call.result-preserved',
        consumption: s.consumption,
        result: s.result,
        custody: evidence('custody'),
        participation: {
          ...high,
          operation: 'agent-custody-2',
          written: '2',
          handover: evidence('commit2'),
        },
      })
      const originalBatch = structuredClone(batch)
      const reduced = reduce(before, batch)
      expect(reduced.kind).toBe('quarantined')
      expect(reduced).not.toHaveProperty('snapshot')
      expect(before).toEqual(original)
      expect(batch).toEqual(originalBatch)
    })
  for (const joint of ['message', 'processed'] as const)
    it(`reduce quarantines a regressed ${joint} participation without changing its input`, async () => {
      const s = await callScene()
      succeeded(
        await s.preserve('high', evidence('custody'), {
          ...participation(s.run.execution.execution, 'custody'),
          written: '5',
          handover: evidence('commit5'),
        }),
        'high',
      )
      const before = await s.read()
      const original = structuredClone(before)
      const part = participation(s.run.execution.execution, joint)
      const entry: SessionEntry =
        joint === 'message'
          ? {
              kind: 'message.assistant',
              message: assistantMessage('regressed message'),
              source: evidence('message'),
              admission: evidence('admitted'),
              consumption: null,
              participation: part,
            }
          : {
              kind: 'call.result-processed',
              consumption: s.consumption,
              result: s.result,
              completion: evidence('processed'),
              participation: part,
              position: null,
            }
      const reduced = replay(before, entry)
      expect(reduced.kind).toBe('quarantined')
      expect(reduced).not.toHaveProperty('snapshot')
      expect(before).toEqual(original)
    })
  it('same-operation recall and a repeated legal batch retain their established execution reference', async () => {
    const s = await callScene()
    const high = {
      ...participation(s.run.execution.execution, 'custody'),
      written: '5',
      handover: evidence('commit5'),
    }
    const original = succeeded(await s.preserve('high', evidence('custody'), high), 'high')
    const before = await s.read()
    expect(succeeded(await s.preserve('high', evidence('custody'), high), 'recall')).toEqual(
      original,
    )
    expect(await s.read()).toEqual(before)
    const next = {
      ...high,
      operation: 'agent-joint-6',
      written: '6',
      handover: evidence('commit6'),
    }
    const batch = committedBatch(
      before,
      {
        kind: 'message.assistant',
        message: assistantMessage('committed result'),
        source: evidence('message'),
        admission: evidence('admitted'),
        consumption: null,
        participation: { ...next, joint: 'message' },
      },
      {
        kind: 'call.result-processed',
        consumption: s.consumption,
        result: s.result,
        completion: evidence('processed'),
        position: null,
        participation: { ...next, joint: 'processed' },
      },
    )
    const reduced = reduce(before, batch)
    expect(reduced.kind).toBe('reduced')
    if (reduced.kind !== 'reduced') return
    expect(reduced.snapshot.executions?.[0]?.execution).toEqual({
      execution: s.run.execution.execution,
      revision: '6',
      evidence: evidence('commit6'),
      readThrough: '1',
    })
    expect(reduced.snapshot.waiting).toEqual([])
    expect(reduce(reduced.snapshot, batch)).toEqual(reduced)
    expect(await s.read()).toEqual(before)
  })
  it('reduce quarantines malformed message participation revisions without throwing', async () => {
    const s = await callScene()
    const before = await s.read()
    const original = structuredClone(before)
    for (const written of ['', '-1', '2.5', 'not-a-revision']) {
      const reduced = replay(before, {
        kind: 'message.assistant',
        message: assistantMessage('invalid revision'),
        source: evidence('message'),
        admission: evidence('admitted'),
        consumption: null,
        participation: { ...participation(s.run.execution.execution, 'message'), written },
      })
      expect(reduced).toEqual({
        kind: 'quarantined',
        diagnostic: 'message.assistant at replay-0: invalid participation revision',
      })
      expect(before).toEqual(original)
    }
  })
  it('reload does not move the original consumption to a different execution', async () => {
    const s = await callScene()
    const current = await s.active()
    succeeded(
      await s.commit({
        kind: 'reload',
        input: {
          ...s.base,
          operation: operationId('reload'),
          run: s.run.run,
          expected: current.snapshot.revision,
          instance: { owner: 'agent', id: 'replacement' },
          candidate: s.run.adoption,
          handover: evidence('reload'),
        },
      }),
      'reload',
    )
    succeeded(await s.process('after-reload'), 'original execution processing')
  })
  for (const first of ['custody', 'completion'] as const)
    it(`${first} first retains original proofs and release through new-operation repeats`, async () => {
      const s = await callScene(true)
      if (first === 'custody') succeeded(await s.preserve('first'), 'first')
      else succeeded(await s.processExternal('first'), 'first')
      succeeded(await s.release('release-first'), 'release')
      succeeded(await s.preserve('custody-repeat'), 'custody')
      succeeded(await s.processExternal('completion-repeat'), 'completion')
      succeeded(await s.release('release-repeat'), 'release repeat')
      const before = await s.read()
      succeeded(await s.preserve('same-custody'), 'same custody')
      succeeded(await s.processExternal('same-completion'), 'same completion')
      expect((await s.read()).consumptions).toEqual(before.consumptions)
      const unchanged = await s.read()
      expect(
        refused(await s.preserve('replace-custody', evidence('other')), 'custody conflict').kind,
      ).toBe('conflict')
      expect(
        refused(
          await s.processExternal(
            'replace-completion',
            s.binding.consumer.position,
            evidence('other'),
          ),
          'completion conflict',
        ).kind,
      ).toBe('conflict')
      expect(await s.read()).toEqual(unchanged)
      expect(unchanged.consumptions[0]?.results[0]).toEqual({
        result: s.result,
        custody: evidence('custody'),
        completion: evidence('processed'),
        release: 'confirmed',
      })
      expect(
        replay(unchanged, {
          kind: 'call.result-preserved',
          consumption: s.consumption,
          result: s.result,
          custody: evidence('other'),
          participation: null,
        }).kind,
      ).toBe('quarantined')
      expect(
        replay(unchanged, {
          kind: 'call.result-processed',
          consumption: s.consumption,
          result: s.result,
          completion: evidence('other'),
          participation: null,
          position: s.binding.consumer.position,
        }).kind,
      ).toBe('quarantined')
      const same = replay(unchanged, {
        kind: 'call.result-preserved',
        consumption: s.consumption,
        result: s.result,
        custody: evidence('custody'),
        participation: null,
      })
      expect(same).toMatchObject({
        kind: 'reduced',
        snapshot: { consumptions: unchanged.consumptions },
      })
      expect(
        replay(unchanged, {
          kind: 'call.execution-fact',
          fact: {
            kind: 'release',
            consumption: s.consumption,
            result: { ...s.result, delivery: 'other' },
            source: evidence('confirm-other'),
          },
        }).kind,
      ).toBe('quarantined')
    })
  it('same completion under another operation retains its proof without repeating its message', async () => {
    const s = await callScene(true)
    const command = {
      kind: 'completeExternalConsumption',
      input: {
        ...s.base,
        operation: operationId('with-message'),
        expected: (await s.read()).revision,
        qualification: evidence('qualified'),
        completion: {
          consumption: s.consumption,
          result: s.result,
          position: s.binding.consumer.position,
          processing: evidence('processed'),
          message: assistantMessage('external result'),
        },
      },
    } satisfies SessionCommand
    const original = succeeded(await s.commit(command), 'completion')
    const afterFirst = await s.read()
    expect(succeeded(await s.commit(command), 'recall')).toEqual(original)
    expect(await s.read()).toEqual(afterFirst)
    succeeded(
      await s.commit({
        ...command,
        input: {
          ...command.input,
          operation: operationId('same-completion-new-operation'),
          expected: afterFirst.revision,
        },
      }),
      'same completion',
    )
    expect((await s.read()).consumptions).toEqual(afterFirst.consumptions)
    expect(
      s.port.controls
        .entriesOf(s.base.tenant, s.base.session)
        .filter(item => item.kind === 'message.assistant'),
    ).toHaveLength(1)
  })
  it('old-version confirmation and conflicting delivery cannot change the next version', async () => {
    const s = await callScene(true)
    succeeded(await s.preserve('version-one'), 'version one')
    const next = {
      ...s.result,
      version: '2',
      delivery: 'delivery-two',
      source: evidence('result-two'),
    }
    succeeded(
      await s.commit({
        kind: 'preserveResult',
        input: {
          ...s.base,
          operation: operationId('version-two'),
          consumption: s.consumption,
          result: next,
          custody: evidence('custody-two'),
          participation: null,
        },
      }),
      'version two',
    )
    succeeded(await s.release('release-one'), 'old release')
    const before = await s.read()
    expect(before.consumptions[0]?.results.map(item => item.release)).toEqual([
      'confirmed',
      'pending',
    ])
    expect(
      refused(
        await s.commit({
          kind: 'preserveResult',
          input: {
            ...s.base,
            operation: operationId('wrong-delivery'),
            consumption: s.consumption,
            result: { ...s.result, delivery: 'changed' },
            custody: evidence('custody'),
            participation: null,
          },
        }),
        'delivery conflict',
      ).kind,
    ).toBe('conflict')
    expect(await s.read()).toEqual(before)
  })
  it('reduce rejects wrong execution, revoked processing and a forged external position', async () => {
    const s = await callScene()
    const entry = {
      kind: 'call.result-processed',
      consumption: s.consumption,
      result: s.result,
      completion: evidence('processed'),
      participation: participation('foreign', 'processed'),
      position: null,
    } satisfies SessionEntry
    expect(replay(await s.read(), entry).kind).toBe('quarantined')
    await s.control('archive')
    expect(
      replay(await s.read(), {
        ...entry,
        participation: participation(s.run.execution.execution, 'processed'),
      }).kind,
    ).toBe('quarantined')
    const external = await callScene(true)
    expect(
      replay(await external.read(), {
        ...entry,
        consumption: external.consumption,
        participation: null,
        position: 'foreign',
      }).kind,
    ).toBe('quarantined')
  })
})

describe('historical calls and archived context', () => {
  it('an old Model call cannot clear successor taken inputs, while its own Model call can', async () => {
    const s = await callScene()
    await s.cancel()
    await s.start('successor')
    const { run } = await s.active()
    succeeded(
      await s.commit({
        kind: 'receive',
        input: {
          ...s.base,
          operation: operationId('hand'),
          fact: {
            kind: 'input-handover',
            execution: run.execution.execution,
            input: run.first,
            result: { kind: 'accepted', receipt: evidence('handed') },
          },
        },
      }),
      'handover',
    )
    succeeded(
      await s.port.controls.project(
        {
          ...s.base,
          run: run.run,
          execution: run.execution.execution,
          revision: '1',
          sequence: '1',
          source: evidence('taken'),
          consequences: [
            {
              kind: 'input-taken',
              batch: {
                id: 'successor-batch' as BatchId,
                watermark: evidence('watermark'),
                ordered: [run.first],
              },
            },
          ],
        },
        operationId('taken'),
      ),
      'taken',
    )
    const successor = (await s.read()).run
    const model: CallBinding = { ...s.binding, producer: { kind: 'model', call: 'old-model' } }
    succeeded(
      await s.port.controls.project(
        {
          ...s.base,
          run: s.run.run,
          execution: s.run.execution.execution,
          revision: '2',
          sequence: '2',
          source: evidence('late-call'),
          consequences: [
            { kind: 'call', consumption: 'old-model' as ConsumptionId, binding: model },
          ],
        },
        operationId('late-call'),
      ),
      'late call',
    )
    expect((await s.read()).taken).toEqual([run.first])
    expect((await s.read()).run).toEqual(successor)
    succeeded(
      await s.port.controls.project(
        {
          ...s.base,
          run: run.run,
          execution: run.execution.execution,
          revision: '2',
          sequence: '2',
          source: evidence('current-call'),
          consequences: [
            {
              kind: 'call',
              consumption: 'current-model' as ConsumptionId,
              binding: {
                ...model,
                producer: { kind: 'model', call: 'current-model' },
                initiatingAttempt: run.advance?.attempt ?? null,
              },
            },
          ],
        },
        operationId('current-call'),
      ),
      'current call',
    )
    expect((await s.read()).taken).toEqual([])
  })
  it('archive refuses new reminders but recalls an already committed operation', async () => {
    const s = scene()
    await s.create()
    const message = judgeMessage({
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'system_reminder',
      blocks: [
        {
          kind: 'text',
          id: 'text',
          text: 'updated context',
          visibility: { toHuman: false, toModel: true },
        },
      ],
    })
    if (!('ok' in message)) throw new Error('invalid reminder fixture')
    const command = {
      kind: 'commitDerived',
      input: {
        ...s.base,
        operation: operationId('reminder'),
        expected: (await s.read()).revision,
        value: { kind: 'context-reminder', message: message.ok, source: evidence('context') },
      },
    } satisfies SessionCommand
    const original = succeeded(await s.commit(command), 'reminder')
    await s.control('archive')
    const before = await s.read()
    const entries = s.port.controls.entriesOf(s.base.tenant, s.base.session)
    expect(succeeded(await s.commit(command), 'recall')).toEqual({ ...original, recovered: true })
    expect(
      refused(
        await s.commit({
          ...command,
          input: { ...command.input, operation: operationId('late'), expected: before.revision },
        }),
        'late',
      ).kind,
    ).toBe('archived')
    expect(await s.read()).toEqual(before)
    expect(s.port.controls.entriesOf(s.base.tenant, s.base.session)).toEqual(entries)
  })
})
