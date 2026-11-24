import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import {
  isProgramEntry,
  isProgramFailureName,
  originRef,
  programFacility,
  type ProgramFacility,
  type ProgramOutcome,
} from '@omne-harness/execution-environment-contract'
import {
  programFacilityConformance,
  runConformanceCase,
} from '@omne-harness/execution-environment-contract/testing'

/** A domain that hands the program the host's own functions: what the suite exists to refuse. */
const leaky: ProgramFacility<unknown> = {
  async run(request) {
    const entry = (argument: unknown) => Promise.resolve(argument)
    const globals = { Twice: entry, Echo: { say: entry }, input: null }
    const body = `(async () => { ${request.source}\n})()`
    const outcome = (runInNewContext(body, globals) as Promise<unknown>).then(
      (value): ProgramOutcome => ({
        kind: 'returned',
        value: { kind: 'string', value: JSON.stringify(value) },
        console: '',
      }),
    )
    const run = { outcome, answer: () => 'not-waiting' as const, abort: () => undefined }
    return { kind: 'done', requestId: request.requestId, value: run }
  },
}

it('declares one guarded operation', () => {
  expect(programFacility).toEqual({ key: 'program', operations: ['run'], guarded: ['run'] })
})

it('refuses a domain that injects host functions directly', async () => {
  const [test] = programFacilityConformance({
    subject: () => ({
      facility: leaky,
      request: () => ({
        requestId: 'request',
        access: { principal: 'someone', tenant: 'tenant' as never },
        origin: originRef('origin'),
        binding: { kind: 'host_machine' },
      }),
    }),
  }).filter(one => one.name === 'program.no-host-in-reach')
  expect(test).toBeDefined()
  if (test === undefined) return
  await expect(runConformanceCase(test)).rejects.toThrow(
    /viaFunction[^,]*object[^,]*,[^,]*viaEntry[^,]*object/,
  )
})

it.each([
  ['Files.read', true],
  ['Twice', true],
  ['$x._y', true],
  ['Files.delete', true],
  ['a-b', false],
  ['A.b.c', false],
  ['', false],
  ['tools', false],
  ['input.x', false],
  ['class', false],
  ['__call', false],
  ['Files.', false],
  ['1a', false],
])('judges %s as a program entry: %s', (name, accepted) => {
  expect(isProgramEntry(name)).toBe(accepted)
})

it('judges a failure name as a free identifier', () => {
  expect(['ToolError', 'tools', 'a.b', 'new'].map(isProgramFailureName)).toEqual([
    true,
    false,
    false,
    false,
  ])
})
