import { describe, expect, it } from 'vitest'
import { commandResult, type CommandObservation } from '@omne-harness/loop-extension'
import { COMMAND_OUTPUT_LIMIT_BYTES } from '@omne-harness/loop-extension-contract'

const evidence = (record: string) => ({
  owner: 'loop-extension',
  record,
  revision: '1',
  digest: 'd',
})
const bytes = (text: string) => new TextEncoder().encode(text)
const exited = (
  code: number,
  stdout: string | Uint8Array,
  dropped = false,
): CommandObservation => ({
  kind: 'exited',
  code,
  stdout: typeof stdout === 'string' ? bytes(stdout) : stdout,
  dropped,
})
const NOT_JSON = {
  kind: 'errored',
  classification: 'bad_output',
  error: 'the output is not a JSON document',
}
const NOT_OUTPUT = {
  kind: 'errored',
  classification: 'bad_output',
  error: 'the output is not an extension output',
}
const OVER = {
  kind: 'errored',
  classification: 'bad_output',
  error: 'the output is over the limit',
}
const padded = (length: number) => {
  const empty = '{"kind":"observed","pad":""}'
  return `{"kind":"observed","pad":"${'x'.repeat(length - empty.length)}"}`
}

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
    ['exit zero with an output that is not JSON', exited(0, 'done'), NOT_JSON],
    [
      'exit zero with bytes that are not UTF-8',
      exited(0, Uint8Array.of(...bytes('{"kind":"observed","x":"'), 0xff, ...bytes('"}'))),
      NOT_JSON,
    ],
    ['exit zero with a JSON array', exited(0, '[1]'), NOT_OUTPUT],
    ['exit zero with a JSON null', exited(0, 'null'), NOT_OUTPUT],
    ['exit zero with a JSON number', exited(0, '7'), NOT_OUTPUT],
    ['exit zero with an object of no kind', exited(0, '{}'), NOT_OUTPUT],
    ['exit zero with a kind that is not text', exited(0, '{"kind":1}'), NOT_OUTPUT],
    [
      'exit zero with an output of exactly the limit',
      exited(0, padded(COMMAND_OUTPUT_LIMIT_BYTES)),
      { kind: 'output', value: { kind: 'observed' } },
    ],
    [
      'exit zero with an output one byte over the limit',
      exited(0, padded(COMMAND_OUTPUT_LIMIT_BYTES + 1)),
      OVER,
    ],
    ['exit zero with bytes the environment dropped', exited(0, '{"kind":"observed"}', true), OVER],
    [
      'a nonzero exit, whatever it wrote',
      exited(3, '{"kind":"observed"}'),
      { kind: 'errored', classification: 'nonzero_exit', error: 'the command exited with code 3' },
    ],
    [
      'no end within the time limit',
      { kind: 'timed-out' },
      { kind: 'errored', classification: 'timeout', error: 'the command ran over its time limit' },
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
