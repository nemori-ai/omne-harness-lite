import { expect, it } from 'vitest'
import {
  judgeConclusion,
  judgeConclusionForSubject,
  judgeInput,
  judgePositionedSubject,
} from '../src/index.ts'
import { at, call, dispatch, inputAt, outputsAt, recordAt, variants } from './helpers.ts'

for (const [index, variant] of variants.entries()) {
  it(`LE-PURE-SUBJECT-${index}: admits the position and preserves old conclusion behavior`, () => {
    const frame = {
      position: variant.position,
      ...(variant.dimension === undefined ? {} : { dimension: variant.dimension }),
      subject: variant.subject,
    }
    const pure = judgePositionedSubject(frame)
    const complete = judgeInput(inputAt(variant))
    expect(pure).toHaveProperty('ok')
    expect(complete).toHaveProperty('ok')
    if (!('ok' in pure) || !('ok' in complete)) throw new Error('valid fixture rejected')
    const record = recordAt(variant, 'observe', { kind: 'observed' })
    expect(
      judgeConclusionForSubject(record, { positionedSubject: pure.ok, extensionName: 'g' }),
    ).toEqual(judgeConclusion(record, { input: complete.ok, extensionName: 'g' }))
    for (const output of outputsAt(variant))
      for (const power of ['observe', 'rewrite', 'veto']) {
        const candidate = recordAt(variant, power, output)
        expect(
          judgeConclusionForSubject(candidate, { positionedSubject: pure.ok, extensionName: 'g' }),
        ).toEqual(judgeConclusion(candidate, { input: complete.ok, extensionName: 'g' }))
      }
    expect(judgePositionedSubject({ ...frame, run: 'run_1' })).toEqual({ rejected: 'malformed' })
    expect(judgePositionedSubject({ ...frame, log: 'log_1' })).toEqual({ rejected: 'malformed' })
    expect(judgePositionedSubject({ ...frame, environment: 'env_1' })).toEqual({
      rejected: 'malformed',
    })
    expect(judgePositionedSubject({ ...frame, earlier: [] })).toEqual({ rejected: 'malformed' })
    expect(judgePositionedSubject({ ...frame, subject: {} })).toEqual({ rejected: 'malformed' })
  })
}

it('LE-PURE-ORDER: domain refusal precedes invalid helper; helper error follows valid record', () => {
  const variant = variants[8]
  if (variant === undefined) throw new Error('missing action fixture')
  const record = recordAt(variant, 'rewrite', { kind: 'rewrite', subject: variant.subject })
  // @ts-expect-error exercise malformed helper at runtime
  expect(judgeConclusionForSubject({ ...record, power: 'future' }, {})).toEqual({
    rejected: 'power_unknown',
  })
  // @ts-expect-error exercise malformed helper at runtime
  expect(() => judgeConclusionForSubject(record, {})).toThrow(TypeError)
  const pure = judgePositionedSubject({ position: variant.position, subject: variant.subject })
  if (!('ok' in pure)) throw new Error('missing pure action')
  expect(
    judgeConclusionForSubject(
      { ...record, extension: 'other' },
      {
        positionedSubject: pure.ok,
        extensionName: 'g',
      },
    ),
  ).toEqual({ rejected: 'malformed' })
  expect(() =>
    judgeConclusionForSubject(
      { ...record, callId: 'other' },
      {
        positionedSubject: pure.ok,
        extensionName: 'g',
      },
    ),
  ).toThrow(TypeError)
  expect(
    judgeConclusionForSubject(
      {
        ...record,
        output: {
          kind: 'rewrite',
          subject: { ...variant.subject, call: { ...call, tool: 'other' } },
        },
      },
      { positionedSubject: pure.ok, extensionName: 'g' },
    ),
  ).toEqual({ rejected: 'rewrite_touches_immutable' })
})

it('LE-PURE-DIMENSION: explicit omission and misplaced dimension retain named refusal', () => {
  const failure = variants[7]
  const started = variants[0]
  if (failure === undefined || started === undefined) throw new Error('missing fixtures')
  expect(judgePositionedSubject({ position: failure.position, subject: failure.subject })).toEqual({
    rejected: 'dimension_missing',
  })
  expect(
    judgePositionedSubject({
      position: started.position,
      dimension: { ending: 'failure' },
      subject: started.subject,
    }),
  ).toEqual({ rejected: 'dimension_not_allowed' })
  expect(judgePositionedSubject({ position: 'future', subject: started.subject })).toEqual({
    rejected: 'position_unknown',
  })
  expect(judgePositionedSubject({ position: 'future', subject: {}, at })).toEqual({
    rejected: 'malformed',
  })
})

it('LE-PURE-FAILURE: dispatch identity and retry association are checked without a Run', () => {
  const failure = variants[7]
  if (failure === undefined) throw new Error('missing failure fixture')
  const frame = {
    position: failure.position,
    dimension: failure.dimension,
    subject: failure.subject,
  }
  const first = judgePositionedSubject(frame)
  expect(first).toHaveProperty('ok')
  if (!('ok' in first)) throw new Error('failure fixture rejected')
  const record = recordAt(failure, 'rewrite', { kind: 'retry', plan: { provider: 'provider-b' } })
  expect(
    judgeConclusionForSubject(record, { positionedSubject: first.ok, extensionName: 'g' }),
  ).toHaveProperty('ok')
  expect(
    judgeConclusionForSubject(
      { ...record, modelCallId: 'another' },
      { positionedSubject: first.ok, extensionName: 'g' },
    ),
  ).toEqual({ rejected: 'malformed' })
  expect(
    judgePositionedSubject({
      ...frame,
      subject: { ...failure.subject, dispatches: [dispatch, { ...dispatch, call: 'another' }] },
    }),
  ).toEqual({ rejected: 'malformed' })
  expect(
    judgePositionedSubject({
      ...frame,
      subject: { ...failure.subject, retryConclusions: [{ ...record, modelCallId: 'another' }] },
    }),
  ).toEqual({ rejected: 'malformed' })
})

it('LE-PURE-OWNED: returned subject is separated from nested caller values', () => {
  const variant = variants[5]
  if (variant === undefined) throw new Error('missing model request fixture')
  const blocks: { id: string; kind: string; text: string }[] = []
  const raw = {
    position: variant.position,
    subject: {
      request: {
        target: 'vendor-a/chat-large',
        parameters: {},
        messages: [{ id: 'msg_own', type: 'user', blocks, createdAt: at }],
        tools: [],
      },
    },
  }
  const admitted = judgePositionedSubject(raw)
  if (!('ok' in admitted) || admitted.ok.position !== 'before_model_call')
    throw new Error('request fixture rejected')
  blocks.push({ id: 'new', kind: 'text', text: 'changed' })
  expect(admitted.ok.subject.request.messages[0]?.blocks).toEqual([])
  expect(raw.subject.request.messages[0]?.blocks).toHaveLength(1)
})
