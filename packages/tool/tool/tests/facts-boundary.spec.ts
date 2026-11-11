// The boundary of receiveFacts (P06, P11): a fact batch is data from an executor that the ledger
// does not trust. A fact that is not a closed record of its kind is refused as `invalid` with the
// field that carries the fault, and a batch with such a fact is saved in no part.
import { describe, expect, it } from 'vitest'
import { admitCall, startHarness } from './start-values.ts'
import { adoption, callId, evidence, ok, principalA, tenantA, text } from './runtime-values.ts'

const identity = { id: 'schema', revision: '1', digest: 'sha256:schema' }

/** A well-formed Ask wait, the way a checkpointed segment ends. */
function askWait(): Record<string, unknown> {
  return {
    kind: 'wait',
    value: {
      kind: 'ask',
      wait: 'op-facts/start/wait',
      resume: evidence('resume'),
      request: evidence('request'),
      schemas: {
        contract: {
          owner: 'test-owner',
          name: 'contract',
          revision: '1',
          digest: 'sha256:contract',
        },
        request: identity,
        response: identity,
        requestMaxBytes: 1024,
        responseMaxBytes: 2048,
        expiry: 'forbidden',
        source: evidence('schemas'),
      },
    },
  }
}

/** A well-formed final fact: raw output custody, a result, the terminal and the effect. */
function finalFact(): Record<string, unknown> {
  return {
    kind: 'final',
    raw: {
      codec: adoption('codec'),
      custody: evidence('raw-custody'),
      content: {
        storage: 'memory',
        key: 'original',
        mediaType: 'application/json',
        bytes: '123',
        digest: 'sha256:raw',
      },
    },
    result: {
      content: [text('answer', 'done')],
      data: { kind: 'none' },
      original: { kind: 'none' },
      attachments: [],
    },
    terminal: { kind: 'completed' },
    effect: { kind: 'occurred', evidence: evidence('effect') },
  }
}

function continuedFact(): Record<string, unknown> {
  return {
    kind: 'continued',
    wait: 'op-facts/start/wait',
    response: 'op-facts/start/wait/accept',
    timing: evidence('timing'),
  }
}

function edited(value: Record<string, unknown>, path: readonly string[], to: unknown) {
  const copy = structuredClone(value)
  let cursor = copy
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>
  const last = path[path.length - 1] as string
  if (to === undefined) delete cursor[last]
  else cursor[last] = to
  return copy
}

async function running() {
  const harness = startHarness()
  await admitCall(harness, 'facts')
  await harness.drive('facts')
  const access = { principal: principalA, tenant: tenantA, call: callId('facts') }
  const recovery = ok(await harness.commands.loadRecovery(access))
  if (recovery.start === null) throw new Error('the fixture did not start')
  const start = recovery.start
  const receive = (fact: unknown) =>
    Reflect.apply(harness.commands.receiveFacts, null, [
      {
        ...access,
        start,
        batch: {
          start,
          source: evidence('facts-source'),
          batch: 'first',
          after: null,
          cursor: 'opaque/end',
          events: [{ event: 'event-1', fact }],
        },
      },
    ]) as Promise<{ failure?: { kind: string; field?: string; reason?: string } }>
  return { harness, receive }
}

describe('a fact that is not a closed record of its kind', () => {
  const wait = (path: readonly string[], to: unknown) => edited(askWait(), path, to)
  const cases: Array<[string, unknown, string | RegExp, string?]> = [
    ['a fact that is not an object', 'text', 'batch.events.fact', 'shape'],
    ['a null fact', null, 'batch.events.fact', 'shape'],
    ['a fact of no kind', { kind: 'weird' }, 'batch.events.fact.kind', 'variant'],
    [
      'a process fact whose blocks are not a list',
      { kind: 'process', blocks: 'x' },
      'batch.events.fact.blocks',
      'shape',
    ],
    [
      'a process fact with a field of its own',
      { kind: 'process', blocks: [], extra: 1 },
      'batch.events.fact.blocks',
      'shape',
    ],
    [
      'a process fact whose blocks are an object',
      { kind: 'process', blocks: {} },
      'batch.events.fact.blocks',
      'shape',
    ],
    [
      'a process block that is not a block',
      { kind: 'process', blocks: [{}] },
      'batch.events.fact.blocks',
      'shape',
    ],
    [
      'a wait fact with a field of its own',
      { ...askWait(), extra: 1 },
      'batch.events.fact',
      'shape',
    ],
    [
      'a wait fact whose value is not an object',
      { kind: 'wait', value: 'ask' },
      'batch.events.fact',
      'shape',
    ],
    [
      'an Ask intent with a field of its own',
      wait(['value', 'extra'], 1),
      'batch.events.fact.value',
      'shape',
    ],
    [
      'an Ask intent whose wait is not an id',
      wait(['value', 'wait'], ''),
      'batch.events.fact.value.wait',
    ],
    [
      'an Ask intent whose resume is not evidence',
      wait(['value', 'resume'], { owner: 'o' }),
      /^batch\.events\.fact\.value\.resume\./u,
    ],
    [
      'an Ask intent whose request is not evidence',
      wait(['value', 'request'], null),
      'batch.events.fact.value.request',
    ],
    [
      'wait schemas that are not a record',
      wait(['value', 'schemas'], 'schemas'),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'wait schemas without their source',
      wait(['value', 'schemas', 'source'], undefined),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request schema that is not an identity',
      wait(['value', 'schemas', 'request'], { id: 'x' }),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request schema with an empty digest',
      wait(['value', 'schemas', 'request'], { ...identity, digest: '' }),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request schema with an empty revision',
      wait(['value', 'schemas', 'request'], { ...identity, revision: '' }),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request schema with an empty id',
      wait(['value', 'schemas', 'request'], { ...identity, id: '' }),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request schema with a field of its own',
      wait(['value', 'schemas', 'request'], { ...identity, extra: 1 }),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a response schema that is not an identity',
      wait(['value', 'schemas', 'response'], null),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a response schema with an empty digest',
      wait(['value', 'schemas', 'response'], { ...identity, digest: '' }),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request limit of zero',
      wait(['value', 'schemas', 'requestMaxBytes'], 0),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request limit below zero',
      wait(['value', 'schemas', 'requestMaxBytes'], -1),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request limit that is text',
      wait(['value', 'schemas', 'requestMaxBytes'], '5'),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request limit that is not an integer',
      wait(['value', 'schemas', 'requestMaxBytes'], 1.5),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a request limit beyond the safe integers',
      wait(['value', 'schemas', 'requestMaxBytes'], 2 ** 53),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a response limit of zero',
      wait(['value', 'schemas', 'responseMaxBytes'], 0),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a response limit that is text',
      wait(['value', 'schemas', 'responseMaxBytes'], '5'),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'an expiry other than forbidden',
      wait(['value', 'schemas', 'expiry'], 'allowed'),
      'batch.events.fact.value.schemas',
      'shape',
    ],
    [
      'a contract adoption that is not complete',
      wait(['value', 'schemas', 'contract'], { owner: 'o' }),
      /^batch\.events\.fact\.value\.schemas\.contract\./u,
    ],
    [
      'a schemas source that is not evidence',
      wait(['value', 'schemas', 'source'], { owner: 'o' }),
      /^batch\.events\.fact\.value\.schemas\.source\./u,
    ],
    [
      'a final fact with a field of its own',
      { ...finalFact(), extra: 1 },
      'batch.events.fact',
      'shape',
    ],
    [
      'a final fact whose terminal is not a terminal',
      { ...finalFact(), terminal: { kind: 'completed', extra: 1 } },
      'batch.events.fact',
      'shape',
    ],
    [
      'a final fact whose effect is not an effect',
      { ...finalFact(), effect: { kind: 'unknown' } },
      'batch.events.fact',
      'shape',
    ],
    [
      'a final fact whose raw output is not closed',
      edited(finalFact(), ['raw', 'extra'], 1),
      'batch.events.fact.raw',
      'shape',
    ],
    [
      'a final fact whose raw codec is not an adoption',
      edited(finalFact(), ['raw', 'codec'], { owner: 'o' }),
      'batch.events.fact.raw',
      'shape',
    ],
    [
      'a final fact whose raw content is not a file reference',
      edited(finalFact(), ['raw', 'content'], 'text'),
      'batch.events.fact.raw',
      'shape',
    ],
    [
      'a final fact whose result the policy refuses',
      { ...finalFact(), result: 'text' },
      'batch.events.fact.result',
      'policy',
    ],
    [
      'a continued fact with a field of its own',
      { ...continuedFact(), extra: 1 },
      'batch.events.fact',
      'shape',
    ],
    [
      'a continued fact whose wait is not an id',
      edited(continuedFact(), ['wait'], ''),
      'batch.events.fact.wait',
    ],
    [
      'a continued fact whose response is not an id',
      edited(continuedFact(), ['response'], 3),
      'batch.events.fact.response',
    ],
    [
      'a continued fact whose timing is not evidence',
      edited(continuedFact(), ['timing'], { owner: 'o' }),
      /^batch\.events\.fact\.timing\./u,
    ],
  ]
  it.each(cases)(
    'refuses %s and saves nothing',
    async (_name: string, fact: unknown, field: string | RegExp, reason?: string) => {
      const { harness, receive } = await running()
      const commits = harness.memory.commits
      const answer = await receive(fact)
      expect(answer.failure).toMatchObject({
        kind: 'invalid',
        field: typeof field === 'string' ? field : expect.stringMatching(field),
        ...(reason === undefined ? {} : { reason }),
      })
      expect(harness.memory.commits).toBe(commits)
    },
  )

  it('receives a well-formed Ask wait, and judges a well-formed continued fact on its wait, not its shape', async () => {
    expect(await (await running()).receive(askWait())).toHaveProperty('ok')
    const answer = await (await running()).receive(continuedFact())
    expect(answer.failure).toMatchObject({ kind: 'invalid', reason: 'continued-without-resume' })
  })
})
