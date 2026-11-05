import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import { originRef, type ProcessHandle } from '@omne-harness/execution-environment-contract'
import {
  createScriptedTerminalFacility,
  runConformanceCase,
  terminalFacilityConformance,
  type TerminalConformanceAcquisition,
  type TerminalConformanceSubject,
} from '@omne-harness/execution-environment-contract/testing'

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('invalid tenant fixture')
const tenant = parsed.value
const obligations = [
  'terminal.lifecycle',
  'terminal.acquisition-ownership',
  'terminal.generation',
  'terminal.list-isolation',
  'terminal.per-terminal-busy',
  'terminal.stop-observation',
  'terminal.close-observation',
]

function subject(
  stop: 'confirmed' | 'unconfirmed',
  shareAcquisition = false,
  closeAnswer: 'confirmed' | 'unconfirmed' = stop,
): TerminalConformanceSubject {
  const controlled = new Set<string>()
  const first = createScriptedTerminalFacility(req => ({
    kind: 'started',
    runs: req.script === 'controlled' ? 'untilStop' : 'exit',
    stop,
  }))
  const second = shareAcquisition
    ? first
    : createScriptedTerminalFacility(req => ({
        kind: 'started',
        runs: req.script === 'controlled' ? 'untilStop' : 'exit',
        stop,
      }))
  let sequence = 0
  function acquisition(scripted: typeof first): TerminalConformanceAcquisition {
    const usedCreateIds = new Set<string>()
    function request() {
      return {
        requestId: `suite-${++sequence}`,
        access: { principal: 'suite', tenant },
        origin: originRef('suite'),
        binding: { kind: 'host_machine' } as const,
      }
    }
    return {
      facility: {
        ...scripted.facility,
        async create(request) {
          if (usedCreateIds.has(request.requestId))
            throw new Error('suite reused a create requestId')
          usedCreateIds.add(request.requestId)
          return scripted.facility.create(request)
        },
        async close(request) {
          if (!controlled.has(request.terminal.id)) return scripted.facility.close(request)
          if (closeAnswer === 'confirmed' && stop === 'unconfirmed')
            await scripted.finish(request.terminal)
          const answer = await scripted.facility.close(request)
          return answer.kind === 'done' ? { ...answer, value: { status: closeAnswer } } : answer
        },
      },
      createRequest: { ...request(), cwd: '.', env: {} },
      request,
      executeRequest: terminal => ({ ...request(), terminal, script: 'normal' }),
    }
  }
  const acquisitions = [acquisition(first), acquisition(second)] as const
  const running = new Map<ProcessHandle, () => Promise<void>>()
  return {
    acquisitions,
    control: {
      stopMode: 'forced',
      stopAnswer: stop,
      closeAnswer,
      async start(acquisition, terminal) {
        const result = await acquisition.facility.execute({
          ...acquisition.executeRequest(terminal),
          script: 'controlled',
        })
        if (result.kind !== 'done') throw new Error(`controlled start: ${result.kind}`)
        controlled.add(terminal.id)
        const scripted = acquisition === acquisitions[0] ? first : second
        running.set(result.value, () => scripted.finish(terminal))
        return result.value
      },
      async finish(process) {
        let ended = false
        void process.result.then(() => {
          ended = true
        })
        await new Promise(resolve => setImmediate(resolve))
        if (!ended) await running.get(process)?.()
      },
    },
    async dispose() {
      first.close()
      second.close()
    },
  }
}

for (const name of obligations) {
  for (const stop of ['confirmed', 'unconfirmed'] as const) {
    it(`${name} accepts scripted terminals with ${stop} stops`, async () => {
      const test = terminalFacilityConformance({ subject: () => subject(stop) }).find(
        test => test.name === name,
      )
      if (!test) throw new Error('missing conformance case')
      expect(await runConformanceCase(test)).toEqual({ name, status: 'pass' })
    })
  }
}

it.each([
  ['confirmed', 'unconfirmed'],
  ['unconfirmed', 'confirmed'],
] as const)('accepts %s process stop with %s terminal close', async (stop, closeAnswer) => {
  const test = terminalFacilityConformance({
    subject: () => subject(stop, false, closeAnswer),
  }).find(test => test.name === 'terminal.close-observation')
  if (!test) throw new Error('missing close conformance case')
  expect(await runConformanceCase(test)).toEqual({ name: test.name, status: 'pass' })
})

it('rejects a facility that shares acquisitions while its ordinary lifecycle still passes', async () => {
  const cases = terminalFacilityConformance({ subject: () => subject('confirmed', true) })
  const lifecycle = cases.find(test => test.name === 'terminal.lifecycle')
  const ownership = cases.find(test => test.name === 'terminal.acquisition-ownership')
  if (!lifecycle || !ownership) throw new Error('missing conformance cases')
  expect(await runConformanceCase(lifecycle)).toMatchObject({ status: 'pass' })
  await expect(runConformanceCase(ownership)).rejects.toMatchObject({ name: 'AssertionError' })
})

it('reports missing controls as not applicable and still disposes the subject', async () => {
  let disposed = 0
  const test = terminalFacilityConformance({
    subject: () => {
      const { control: _control, ...fixture } = subject('confirmed')
      return {
        ...fixture,
        async dispose() {
          disposed++
          await fixture.dispose?.()
        },
      }
    },
  }).find(test => test.name === 'terminal.per-terminal-busy')
  if (!test) throw new Error('missing conformance case')
  expect(await runConformanceCase(test)).toMatchObject({
    status: 'not-applicable',
    reason: expect.any(String),
  })
  expect(disposed).toBe(1)
})

it('assembles a lazy, unique case list without allocating facilities', () => {
  const cases = terminalFacilityConformance({
    subject() {
      throw new Error('eager allocation')
    },
  })
  expect(cases.map(test => test.name)).toEqual(obligations)
  expect(new Set(cases.map(test => test.name)).size).toBe(obligations.length)
})
