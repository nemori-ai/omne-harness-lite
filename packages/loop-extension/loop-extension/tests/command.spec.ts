import { describe, expect, it } from 'vitest'
import { commandResult, type CommandObservation } from '@omne-harness/loop-extension'
import {
  COMMAND_OUTPUT_LIMIT_BYTES,
  commandRequest,
  commandTimeoutMs,
} from '@omne-harness/loop-extension-contract'
import type { ExtensionInput, ExtensionReplayBinding } from '@omne-harness/agent-contract'

const evidence = (record: string) => ({
  owner: 'loop-extension',
  record,
  revision: '1',
  digest: 'd',
})
const bytes = (text: string) => new TextEncoder().encode(text)
const exited = (code: number, stdout: string, dropped = false): CommandObservation => ({
  kind: 'exited',
  code,
  stdout: bytes(stdout),
  dropped,
})

describe('what a command run was seen to do, as a call result', () => {
  it.each([
    ['the start was refused', { kind: 'not-entered' }, { kind: 'notStartedUnavailable' }],
    [
      'the reply of the start is unknown',
      { kind: 'start-unknown', recovery: evidence('call') },
      { kind: 'invocationUnresolved', start: { kind: 'unknown' }, recovery: evidence('call') },
    ],
    [
      'exit zero with a lawful output',
      exited(0, '{"kind":"veto","reason":"no"}'),
      { kind: 'output', value: { kind: 'veto', reason: 'no' } },
    ],
    [
      'exit zero with an output that is not JSON',
      exited(0, 'done'),
      { kind: 'errored', classification: 'bad_output' },
    ],
    [
      'exit zero with JSON that is not an output',
      exited(0, '[1]'),
      { kind: 'errored', classification: 'bad_output' },
    ],
    [
      'exit zero with an output over the limit',
      exited(0, `{"kind":"observed","pad":"${'x'.repeat(COMMAND_OUTPUT_LIMIT_BYTES)}"}`),
      { kind: 'errored', classification: 'bad_output' },
    ],
    [
      'exit zero with bytes the environment dropped',
      exited(0, '{"kind":"observed"}', true),
      { kind: 'errored', classification: 'bad_output' },
    ],
    [
      'a nonzero exit, whatever it wrote',
      exited(3, '{"kind":"observed"}'),
      { kind: 'errored', classification: 'nonzero_exit', error: 'the command exited with code 3' },
    ],
    [
      'no end within the time limit',
      { kind: 'timed-out' },
      { kind: 'errored', classification: 'timeout' },
    ],
    [
      'contact lost after the start',
      { kind: 'lost', started: evidence('started'), recovery: evidence('call') },
      {
        kind: 'invocationUnresolved',
        start: { kind: 'started', evidence: evidence('started') },
        recovery: evidence('call'),
      },
    ],
  ] as const)('%s', (_name, observation, result) => {
    expect(commandResult(observation)).toMatchObject(result)
  })

  it('keeps the text a command wrote out of the error it reports', () => {
    const result = commandResult(exited(0, 'a secret the script printed'))
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})

describe('the protocol of a command implementation', () => {
  const input = { passage: 'pass/call/1' } as unknown as ExtensionInput

  it('gives a fresh call its input and no rounds, and a replay the rounds it already has', () => {
    expect(commandRequest(input, { kind: 'fresh' })).toEqual({
      protocol: 'omne-loop-extension/1',
      mode: 'fresh',
      input,
      rounds: [],
    })
    const rounds = [{ round: 'r1', cards: [] }] as unknown as ExtensionReplayBinding['rounds']
    const binding = { passage: input.passage, rounds, control: 'valid' } as ExtensionReplayBinding
    expect(commandRequest(input, { kind: 'replay', binding })).toMatchObject({
      mode: 'replay',
      rounds,
    })
  })

  it.each([
    ['PT10S', 10_000],
    ['PT1M30S', 90_000],
    ['PT0.5S', 500],
    ['PT1H', 3_600_000],
    ['PT0S', null],
    ['P1D', null],
    ['P1M', null],
    ['10s', null],
  ] as const)('reads the time limit %s as %s milliseconds', (duration, expected) => {
    expect(commandTimeoutMs(duration)).toBe(expected)
  })
})
