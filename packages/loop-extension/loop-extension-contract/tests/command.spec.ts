import { describe, expect, it } from 'vitest'
import type { ExtensionInput, ExtensionReplayBinding } from '@omne-harness/agent-contract'
import {
  COMMAND_OUTPUT_LIMIT_BYTES,
  COMMAND_PROTOCOL,
  commandRequest,
  commandTimeoutMs,
} from '@omne-harness/loop-extension-contract'

describe('the protocol of a command implementation', () => {
  const input = { passage: 'pass/call/1' } as unknown as ExtensionInput

  it('names its version, and bounds the output at 64 KiB', () => {
    expect(COMMAND_PROTOCOL).toBe('omne-loop-extension/1')
    expect(COMMAND_OUTPUT_LIMIT_BYTES).toBe(65_536)
  })

  it('gives a fresh call its input and no rounds, and a replay the rounds it already has', () => {
    expect(commandRequest(input, { kind: 'fresh' })).toEqual({
      protocol: 'omne-loop-extension/1',
      mode: 'fresh',
      input,
      rounds: [],
    })
    const rounds = [{ round: 'r1', cards: [] }] as unknown as ExtensionReplayBinding['rounds']
    const binding = { passage: input.passage, rounds, control: 'valid' } as ExtensionReplayBinding
    expect(commandRequest(input, { kind: 'replay', binding })).toEqual({
      protocol: 'omne-loop-extension/1',
      mode: 'replay',
      input,
      rounds,
    })
  })

  it.each([
    ['PT10S', 10_000],
    ['PT90S', 90_000],
    ['PT0.5S', 500],
    ['PT1.25S', 1250],
    ['PT15M', 900_000],
    ['PT1M30S', 90_000],
    ['PT1H', 3_600_000],
    ['PT12H', 43_200_000],
    ['PT1H30M', 5_400_000],
    ['PT1H2M3S', 3_723_000],
  ] as const)('reads the time limit %s as %s milliseconds', (duration, expected) => {
    expect(commandTimeoutMs(duration)).toBe(expected)
  })

  it.each([
    ['of no length', 'PT0S'],
    ['of no part', 'PT'],
    ['with a calendar day', 'P1D'],
    ['with a calendar month', 'P1M'],
    ['that is not a duration', '10s'],
    ['with text before it', 'xPT1S'],
    ['with text after it', 'PT1Sx'],
    ['with a part that is not a number', 'PTxS'],
    ['too long to be a number', `PT${'9'.repeat(400)}H`],
  ] as const)('runs no command with a time limit %s', (_name, duration) => {
    expect(commandTimeoutMs(duration)).toBeNull()
  })
})
