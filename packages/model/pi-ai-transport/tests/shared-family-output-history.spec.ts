import { describe, it, expect, vi } from 'vitest'
import {
  writeJsonLossless,
  LosslessNumber,
  judgeContentBlock,
  toOpaqueJson,
  type JsonObject,
} from '@omne-harness-lite/content-blocks'
import type { PlanOutputHistoryGroup } from '@omne-harness-lite/model-request-runtime'
import {
  defineInputMeter,
  type FullMeterInput,
  type NewMeterInput,
  type ReplayMeterInput,
} from '../src/input-meter.ts'
import { projectInput, projectOutput, canonicalProjection } from '../src/projection.ts'
import {
  fullOutputHistory,
  newOutputHistory,
  replayOutputHistory,
  type OutputHistoryPolicy,
} from '../src/input-meters/output-history.ts'
import { withOutputPrefix } from '../src/input-meters/output-prefix.ts'
import { projectAssistant } from '../src/assistant-projection.ts'
import { object } from '../src/json.ts'
import { input, judgedMessage, at } from './support.ts'
import { ExactDecimal } from '@omne-harness-lite/call-accounts'

function fixture() {
  const request = input()
  const meter = defineInputMeter({
    modelId: request.routeName,
    definitionRevision: request.snapshot.adaptation.definition.revision,
    implementation: request.snapshot.adaptation.implementation,
    provider: request.provider,
    algorithmRevision: 'shared-fixture/1',
    tokenizerRevision: 'shared-fixture-tokenizer/1',
    replayRevision: 'shared-fixture-replay/1',
    evidence: 'named local finite fixture, not vendor certification',
    measureFull: () => ({ kind: 'unavailable' }),
  })
  const envelope: JsonObject = {
    model: request.routeName,
    provider: { order: [request.provider], allow_fallbacks: false, require_parameters: true },
    max_tokens: 128,
  }
  const prefix = { role: 'user', content: 'stable-prefix-never-tokenize' }
  const origin = projectInput({ ...envelope, messages: [prefix] }, request, meter)
  const reply = judgedMessage({
    type: 'assistant',
    id: 'a',
    response: 'r',
    ending: 'complete',
    createdAt: at,
    blocks: [
      {
        kind: 'thinking',
        id: 'reason',
        text: '',
        opaque: toOpaqueJson({
          routeName: request.routeName,
          reasoning_details: [
            { type: 'reasoning.encrypted', data: 'never-tokenize-opaque', format: 'fixture-v1' },
          ],
        }),
        visibility: { toHuman: false, toModel: true },
      },
      { kind: 'text', id: 'text', text: 'answer', visibility: { toHuman: true, toModel: true } },
    ],
  })
  const projected = projectAssistant(reply.blocks, request.routeName, false)
  if ('rejected' in projected) throw Error('assistant')
  const output = projectOutput({ blocks: reply.blocks, source: 'reply', completeness: 'complete' })
  if (!('projected' in output)) throw Error('output')
  const group: PlanOutputHistoryGroup = {
    inputCalibration: {
      requestInput: origin.requestInput,
      observedInput: {
        kind: 'from_usage',
        provenance: { adapterRevision: 'fixture-reader/1', fieldPaths: ['usage.prompt_tokens'] },
      },
      outputGroup: output.projected,
    },
    usage: {
      input_tokens: 100,
      output_tokens: 18,
      cache_read_tokens: 0,
      cache_write_tokens: 0,
      reasoning_tokens: 7,
      source: 'upstream',
    },
    outputBlocks: reply.blocks,
    replaySelection: reply.blocks.map((_, i) => ({
      sourceBlockIndex: i,
      messageIndex: 1,
      blockIndex: i,
    })),
    origin: {
      adaptation: request.snapshot.adaptation,
      provider: request.provider,
      parameters: { maxOutputTokens: 128 },
    },
  }
  const body = {
    ...envelope,
    messages: [prefix, projected.message, { role: 'user', content: 'new' }],
  }
  const projection = projectInput(body, request, meter)
  const historySpans = group.replaySelection.map((_, selectionIndex) => ({
    groupIndex: 0,
    selectionIndex,
    start: 1,
    end: 2,
  }))
  const full: FullMeterInput = {
    body,
    serialized: writeJsonLossless(body),
    projection,
    outputHistory: [group],
    historySpans,
  }
  const fresh: NewMeterInput = Object.freeze({
    units: projection.units.slice(1),
    envelope: projection.envelope,
    precedingUnitCount: 1,
    unitIndices: [1, 2],
    countingBasis: projection.requestInput.countingBasis,
    outputHistory: [group],
    historySpans,
  })
  const replay: ReplayMeterInput = Object.freeze({
    units: [projected.message],
    envelope: projection.envelope,
    precedingUnitCount: 1,
    unitIndices: [1],
    countingBasis: projection.requestInput.countingBasis,
    observation: {
      kind: 'observation' as const,
      inputCalibration: group.inputCalibration,
      usage: group.usage,
      outputBlocks: group.outputBlocks,
      replaySelection: group.replaySelection,
    },
    outputHistory: [group],
    selectionSpans: historySpans.map(({ groupIndex: _g, ...span }) => span),
  })
  const policy: OutputHistoryPolicy = {
    classifyUnit: unit =>
      object(unit) && Object.hasOwn(unit, 'reasoning_details') ? 'wholeGroup' : 'visible',
    sourceApplies: source =>
      source.origin === undefined || source.origin.provider === request.provider,
    originalBasisApplies: () => () => true,
    requiresSignedPrefix: () => false,
    projectionRevisionApplies: revision => revision === origin.requestInput.projectionRevision,
  }
  const counter = vi.fn(({ body }: { body: JsonObject }) => ({
    kind: 'estimated' as const,
    tokens: 5 + (Array.isArray(body.messages) ? body.messages.length * 10 : 0),
  }))
  return { meter, policy, counter, full, fresh, replay, group, projection, envelope, request }
}
function amount(result: ReturnType<typeof newOutputHistory>): string {
  return 'tokens' in result ? ExactDecimal.from(result.tokens).toString() : result.kind
}
describe('shared complete output group composition', () => {
  it('full/new/phi share O once and exclude ciphertext from every raw counter', () => {
    const f = fixture()
    expect(amount(fullOutputHistory(f.full, f.meter, f.counter, f.policy))).toBe('43')
    expect(amount(newOutputHistory(f.fresh, f.meter, f.counter, f.policy))).toBe('28')
    expect(amount(replayOutputHistory(f.replay, f.meter, f.counter, f.policy))).toBe('18')
    for (const [arg] of f.counter.mock.calls)
      expect(writeJsonLossless(arg.body)).not.toContain('never-tokenize-opaque')
  })
  it('multiple complete groups use exact decimal addition without binary rounding or extra reasoning', () => {
    const f = fixture()
    const blocks = f.group.outputBlocks.map(block => {
      const judged = judgeContentBlock({ ...block, id: `${block.id}-second` })
      if ('rejected' in judged) throw Error('block fixture')
      return judged.ok
    })
    const output = projectOutput({ blocks, source: 'reply', completeness: 'complete' })
    if (!('projected' in output)) throw Error('second output')
    const first = {
      ...f.group,
      usage: { ...f.group.usage, output_tokens: new LosslessNumber('9007199254740993') },
    }
    const second: PlanOutputHistoryGroup = {
      ...f.group,
      outputBlocks: blocks,
      inputCalibration: { ...f.group.inputCalibration, outputGroup: output.projected },
      replaySelection: f.group.replaySelection.map(s => ({ ...s, messageIndex: 3 })),
    }
    const body = {
      ...f.full.body,
      messages: [...f.projection.units, f.projection.units[1]!, { role: 'user', content: 'last' }],
    }
    const projection = projectInput(body, f.request, f.meter)
    const historySpans = [
      ...f.full.historySpans,
      ...f.full.historySpans.map(s => ({ ...s, groupIndex: 1, start: 3, end: 4 })),
    ]
    const full = {
      body,
      serialized: writeJsonLossless(body),
      projection,
      outputHistory: [first, second],
      historySpans,
    }
    expect(amount(fullOutputHistory(full, f.meter, f.counter, f.policy))).toBe('9007199254741046')
    const fresh = {
      ...f.fresh,
      units: projection.units.slice(1),
      unitIndices: [1, 2, 3, 4],
      outputHistory: [first, second],
      historySpans,
    }
    expect(amount(newOutputHistory(fresh, f.meter, f.counter, f.policy))).toBe('9007199254741031')
  })
  it('phi requires known original input usage even when its basis is identical', () => {
    const f = fixture()
    const input: ReplayMeterInput = {
      ...f.replay,
      observation: {
        ...f.replay.observation,
        inputCalibration: {
          ...f.replay.observation.inputCalibration,
          observedInput: { kind: 'unavailable', reason: 'scope_unknown' },
        },
      },
      outputHistory: [
        {
          ...f.group,
          inputCalibration: {
            ...f.group.inputCalibration,
            observedInput: { kind: 'unavailable', reason: 'scope_unknown' },
          },
        },
      ],
    }
    expect(replayOutputHistory(input, f.meter, f.counter, f.policy)).toEqual({
      kind: 'unavailable',
    })
    expect(f.counter).not.toHaveBeenCalled()
    expect(
      amount(
        newOutputHistory(
          { ...f.fresh, outputHistory: input.outputHistory },
          f.meter,
          f.counter,
          f.policy,
        ),
      ),
    ).toBe('28')
  })
  it('stable P never reaches the marginal counter and valid broad-envelope change loses signed proof', () => {
    const f = fixture(),
      policy = { ...f.policy, requiresSignedPrefix: () => true }
    expect(
      amount(
        withOutputPrefix(f.fresh, f.projection, () =>
          newOutputHistory(f.fresh, f.meter, f.counter, policy),
        ),
      ),
    ).toBe('28')
    for (const [arg] of f.counter.mock.calls)
      expect(writeJsonLossless(arg.body)).not.toContain('stable-prefix-never-tokenize')
    f.counter.mockClear()
    const changed = projectInput({ ...f.full.body, max_tokens: 256 }, f.request, f.meter)
    const fresh = Object.freeze({ ...f.fresh, envelope: changed.envelope })
    expect(
      withOutputPrefix(fresh, changed, () => newOutputHistory(fresh, f.meter, f.counter, policy)),
    ).toEqual({ kind: 'unavailable' })
    expect(f.counter).not.toHaveBeenCalled()
  })
  it('rejects duplicate targets and changed summaries before counting', () => {
    const f = fixture()
    expect(
      fullOutputHistory(
        {
          ...f.full,
          outputHistory: [f.group, f.group],
          historySpans: [
            ...f.full.historySpans,
            ...f.full.historySpans.map(s => ({ ...s, groupIndex: 1 })),
          ],
        },
        f.meter,
        f.counter,
        f.policy,
      ),
    ).toEqual({ kind: 'unavailable' })
    const bad = {
      ...f.group,
      inputCalibration: {
        ...f.group.inputCalibration,
        outputGroup: {
          ...f.group.inputCalibration.outputGroup,
          usageRef: 'usage' as const,
          kind: 'known' as const,
          source: 'reply' as const,
          completeness: 'complete' as const,
          projectionRevision: f.projection.requestInput.projectionRevision,
          blockDigests: ['0'.repeat(64), '0'.repeat(64)],
        },
      },
    }
    expect(
      newOutputHistory({ ...f.fresh, outputHistory: [bad] }, f.meter, f.counter, f.policy),
    ).toEqual({ kind: 'invalidInput' })
    expect(f.counter).not.toHaveBeenCalled()
  })
  it('unknown opaque mappings, partial original group and a counter exception cannot fall through', () => {
    const f = fixture()
    expect(
      newOutputHistory(f.fresh, f.meter, f.counter, {
        ...f.policy,
        classifyUnit: () => 'uninterpretable',
      }),
    ).toEqual({ kind: 'unavailable' })
    const group = { ...f.group, replaySelection: f.group.replaySelection.slice(0, 1) }
    expect(
      newOutputHistory(
        { ...f.fresh, outputHistory: [group], historySpans: f.fresh.historySpans.slice(0, 1) },
        f.meter,
        f.counter,
        f.policy,
      ),
    ).toEqual({ kind: 'unavailable' })
    expect(f.counter).not.toHaveBeenCalled()
    expect(
      newOutputHistory(
        f.fresh,
        f.meter,
        () => {
          throw Error('counter')
        },
        f.policy,
      ),
    ).toEqual({ kind: 'unavailable' })
  })
  it('owns inputs before trusted rules run and verifies independent full projection facts', () => {
    const f = fixture()
    const policy = {
      ...f.policy,
      sourceApplies: () => {
        Object.assign(f.group.usage, { output_tokens: 999 })
        return true
      },
    }
    expect(amount(fullOutputHistory(f.full, f.meter, f.counter, policy))).toBe('43')
    expect(
      fullOutputHistory(
        {
          ...f.full,
          projection: {
            ...f.projection,
            requestInput: { ...f.projection.requestInput, prefixDigest: '0'.repeat(64) },
          },
        },
        f.meter,
        f.counter,
        f.policy,
      ),
    ).toEqual({ kind: 'unavailable' })
    let reads = 0
    const malformed = Object.defineProperty({}, 'body', {
      enumerable: true,
      get() {
        reads++
        return f.full.body
      },
    })
    expect(
      Reflect.apply(fullOutputHistory, undefined, [malformed, f.meter, f.counter, f.policy]),
    ).toEqual({ kind: 'unavailable' })
    expect(reads).toBe(0)
  })
  it('signed prefix capability is exact identity, is cleaned on throw, and isolates reentry', () => {
    const f = fixture(),
      policy = { ...f.policy, requiresSignedPrefix: () => true }
    expect(newOutputHistory(f.fresh, f.meter, f.counter, policy)).toEqual({ kind: 'unavailable' })
    expect(
      amount(
        withOutputPrefix(f.fresh, f.projection, () =>
          newOutputHistory(f.fresh, f.meter, f.counter, policy),
        ),
      ),
    ).toBe('28')
    withOutputPrefix(f.fresh, f.projection, () => {
      expect(newOutputHistory({ ...f.fresh }, f.meter, f.counter, policy)).toEqual({
        kind: 'unavailable',
      })
      expect(() => withOutputPrefix(f.fresh, f.projection, () => null)).toThrow(
        'active meter input',
      )
    })
    expect(() =>
      withOutputPrefix(f.fresh, f.projection, () => {
        throw Error('after install')
      }),
    ).toThrow('after install')
    expect(newOutputHistory(f.fresh, f.meter, f.counter, policy)).toEqual({ kind: 'unavailable' })
    const other = Object.freeze({ ...f.fresh })
    withOutputPrefix(f.fresh, f.projection, () =>
      withOutputPrefix(other, f.projection, () => {
        expect(amount(newOutputHistory(f.fresh, f.meter, f.counter, policy))).toBe('28')
        expect(amount(newOutputHistory(other, f.meter, f.counter, policy))).toBe('28')
      }),
    )
  })
  it('same N under different P or an inserted message never receives signed prefix proof', () => {
    const f = fixture(),
      policy = { ...f.policy, requiresSignedPrefix: () => true }
    const changed = projectInput(
      {
        ...f.full.body,
        messages: [{ role: 'user', content: 'changed' }, ...f.projection.units.slice(1)],
      },
      f.request,
      f.meter,
    )
    expect(canonicalProjection(changed.units.slice(1))).toBe(canonicalProjection(f.fresh.units))
    expect(
      withOutputPrefix(f.fresh, changed, () =>
        newOutputHistory(f.fresh, f.meter, f.counter, policy),
      ),
    ).toEqual({ kind: 'unavailable' })
    const moved = Object.freeze({
      ...f.fresh,
      unitIndices: [2, 3],
      historySpans: f.fresh.historySpans.map(s => ({ ...s, start: 2, end: 3 })),
    })
    const inserted = projectInput(
      {
        ...f.full.body,
        messages: [
          f.projection.units[0]!,
          { role: 'user', content: 'inserted' },
          ...f.projection.units.slice(1),
        ],
      },
      f.request,
      f.meter,
    )
    expect(
      withOutputPrefix(moved, inserted, () => newOutputHistory(moved, f.meter, f.counter, policy)),
    ).toEqual({ kind: 'unavailable' })
    expect(f.counter).not.toHaveBeenCalled()
  })
})
