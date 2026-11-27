import { describe, expect, it } from 'vitest'
import { faultProblem } from '@omne-harness/model-contract'

const plain = { cause: 'upstream-unavailable', diagnostic: 'http-503', upstreamStatus: '503' }
const overLimit = {
  cause: 'input-over-limit',
  diagnostic: 'media-over-limit',
  upstreamStatus: null,
  reported: { metric: 'image-bytes', limit: '4194304', actual: null },
}
const replay = {
  cause: 'replay-rejected',
  diagnostic: 'replay-signature',
  upstreamStatus: '400',
  replayCarried: true,
}

describe('faultProblem', () => {
  it('accepts each of the fourteen causes', () => {
    for (const cause of [
      'profile-withdrawn',
      'excluded',
      'modality',
      'credential',
      'input-rejected',
      'upstream-unavailable',
      'stream-lost',
      'runtime-lost',
      'persistence',
      'policy-unavailable',
      'upstream-protocol',
      'unclassified',
    ])
      expect(faultProblem({ ...plain, cause })).toBeNull()
    expect(faultProblem(overLimit)).toBeNull()
    expect(faultProblem(replay)).toBeNull()
  })

  it('takes throttled only as true, and only on an upstream that is unavailable', () => {
    expect(faultProblem({ ...plain, throttled: true })).toBeNull()
    expect(faultProblem({ ...plain, throttled: false })).toBe('throttled')
    expect(faultProblem({ ...plain, cause: 'credential', throttled: true })).toBe('throttled')
    expect(faultProblem({ ...plain, cause: 'stream-lost', throttled: true })).toBe('throttled')
  })

  it('accepts every shape the contract describes', () => {
    for (const fault of [
      plain,
      { ...plain, replayCarried: true },
      overLimit,
      { ...overLimit, replayCarried: true },
      { ...overLimit, reported: { metric: null, limit: null, actual: '12' } },
      { ...overLimit, reported: { metric: 'context-tokens', limit: '0', actual: '1' } },
      { ...overLimit, reported: { metric: 'input-tokens', limit: null, actual: null } },
      { ...overLimit, reported: { metric: 'file-bytes', limit: '33554432', actual: null } },
      replay,
      { cause: 'unclassified', diagnostic: 'x'.repeat(200), upstreamStatus: null },
      {
        cause: 'unclassified',
        diagnostic: 'a gateway timeout, then nothing',
        upstreamStatus: null,
      },
    ])
      expect(faultProblem(fault)).toBeNull()
  })

  it.each([
    ['a value that is not an object', null, 'fault'],
    ['an array', [], 'fault'],
    ['a field the contract does not name', { ...plain, body: 'secret' }, 'fault'],
    ['a cause outside the fourteen', { ...plain, cause: 'rate-limited' }, 'cause'],
    ['a missing diagnostic', { cause: 'stream-lost', upstreamStatus: null }, 'diagnostic'],
    ['an empty diagnostic', { ...plain, diagnostic: '' }, 'diagnostic'],
    ['a diagnostic over 200 characters', { ...plain, diagnostic: 'x'.repeat(201) }, 'diagnostic'],
    ['a diagnostic of two lines', { ...plain, diagnostic: 'one\ntwo' }, 'diagnostic'],
    ['a diagnostic with a control character', { ...plain, diagnostic: 'a\u0007b' }, 'diagnostic'],
    ['a diagnostic with a delete character', { ...plain, diagnostic: 'a\u007fb' }, 'diagnostic'],
    ['a diagnostic carrying a URL', { ...plain, diagnostic: 'see https://x.test/' }, 'diagnostic'],
    ['a missing status', { cause: 'stream-lost', diagnostic: 'gone' }, 'upstream-status'],
    ['a status of four digits', { ...plain, upstreamStatus: '5030' }, 'upstream-status'],
    ['a status as a number', { ...plain, upstreamStatus: 503 }, 'upstream-status'],
    [
      'a replay refusal without the carried mark',
      { ...replay, replayCarried: undefined },
      'replay-carried',
    ],
    ['a carried mark that is false', { ...plain, replayCarried: false }, 'replay-carried'],
    ['an over-limit cause without its report', { ...overLimit, reported: undefined }, 'reported'],
    [
      'a report with an unknown metric',
      { ...overLimit, reported: { metric: 'bytes', limit: null, actual: null } },
      'reported',
    ],
    [
      'a report whose limit is a number',
      { ...overLimit, reported: { metric: null, limit: 5, actual: null } },
      'reported',
    ],
    [
      'a report whose limit is not decimal',
      { ...overLimit, reported: { metric: null, limit: '1.5', actual: null } },
      'reported',
    ],
    [
      'a report with an extra field',
      { ...overLimit, reported: { metric: null, limit: null, actual: null, unit: 'b' } },
      'reported',
    ],
    ['a report on another cause', { ...plain, reported: overLimit.reported }, 'reported'],
  ])('refuses %s', (_name, fault, problem) => {
    const value =
      typeof fault === 'object' && fault !== null && !Array.isArray(fault)
        ? Object.fromEntries(Object.entries(fault).filter(([, v]) => v !== undefined))
        : fault
    expect(faultProblem(value)).toBe(problem)
  })
})
