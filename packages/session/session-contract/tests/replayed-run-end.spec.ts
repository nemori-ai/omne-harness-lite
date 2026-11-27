import { describe, expect, it } from 'vitest'
import type { RunFailure, SessionLogConsequence } from '@omne-harness/session-contract'
import { evidence, operationId, refused, succeeded } from '@omne-harness/session-contract/testing'
import { open } from './scene.ts'

const NODE = { kind: 'node-failed', node: 'E4', category: 'rejected', failureKind: 'invalid' }
const NO_REPLY = {
  kind: 'no-reply',
  cause: 'upstream-unavailable',
  upstreamStatus: null,
  diagnostic: 'in-band-error',
}

// A second operation is refused for being another one, after the consequences were read: which field is
// refused says whether the end was.
async function endedTwice(failure: unknown) {
  const s = await open()
  const { run } = await s.active()
  const observation = {
    ...s.base,
    run: run.run,
    execution: run.execution.execution,
    revision: '5',
    source: evidence('ended'),
    sequence: '1',
    consequences: [
      {
        kind: 'ended',
        outcome: 'failed',
        cause: null,
        disposition: evidence('failed'),
        end: { conclusion: 'fail', failure: failure as RunFailure },
      },
    ] satisfies readonly SessionLogConsequence[],
  }
  succeeded(await s.project(observation, operationId('interpret-end')), 'project')
  return refused(await s.project(observation, operationId('another')), 'project again')
}

describe('the end of a Run, observed again', () => {
  it.each([
    ['a failed node with the line its failure disclosed', { ...NODE, diagnostic: 'command_limit' }],
    ['a failed node that disclosed nothing', NODE],
    ['a call without reply from a throttled upstream', { ...NO_REPLY, throttled: true }],
    ['a call without reply from an upstream that was not throttled', NO_REPLY],
  ])('%s is read without complaint', async (_name, failure) => {
    expect(await endedTwice(failure)).toMatchObject({ kind: 'invalid', field: 'operation' })
  })

  it.each([
    ['an empty line', { ...NODE, diagnostic: '' }, 'ended.end.failure.diagnostic'],
    [
      'a throttled mark that is not true',
      { ...NO_REPLY, throttled: false },
      'ended.end.failure.throttled',
    ],
  ])('%s is refused by its field', async (_name, failure, field) => {
    expect(await endedTwice(failure)).toMatchObject({ kind: 'invalid', field })
  })
})
