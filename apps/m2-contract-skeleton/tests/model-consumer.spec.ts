import { describe, expect, it } from 'vitest'
import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
} from '@omne-harness/model-contract/conformance'
import { createScriptedConformanceSubject } from '@omne-harness/model-contract/testing'
import { modelFragments, skeletonInputs } from './first-path-doubles.ts'
import { inspectModelReport } from '../src/model.ts'
import { runContractSkeleton } from '../src/index.ts'

describe('public Model conformance consumer', () => {
  it('executes every public obligation once and retains its result', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    const fragments = modelFragments(report)
    expect(fragments.map(fragment => fragment.fragmentId)).toEqual([...CONFORMANCE_OBLIGATIONS])
    expect(fragments.every(fragment => fragment.status === 'pass')).toBe(true)
    expect(report.checksPassed).toBe(true)
    expect(report.hops.find(hop => hop.hopId === 'H06')).toMatchObject({
      state: 'verified',
      blockedBy: [],
    })
    expect(report.fullPath).toBe('complete')
  })

  it('rejects not-applicable even when the public suite reports ok', async () => {
    const subject = () => {
      const base = createScriptedConformanceSubject()
      const { settleCall, ...hooks } = base.hooks ?? {}
      void settleCall
      return { ...base, hooks }
    }
    const publicReport = await checkModelProviderConformance({ subject, waitMs: 500 })
    expect(publicReport.ok).toBe(true)
    expect(publicReport.results.some(result => result.status === 'not-applicable')).toBe(true)
    expect(inspectModelReport(publicReport).scenario.matchesExpected).toBe(false)
    const report = await runContractSkeleton(skeletonInputs({ model: { subject, waitMs: 500 } }))
    expect(report.checksPassed).toBe(false)
    expect(modelFragments(report).some(fragment => fragment.status === 'not-applicable')).toBe(true)
    expect(report.fullPath).toBe('incomplete')
  })

  it('detects missing and duplicate obligation results independently of ok', async () => {
    const result = await checkModelProviderConformance({
      subject: createScriptedConformanceSubject,
      waitMs: 500,
    })
    const first = result.results[0]
    if (first === undefined) throw new Error('No obligations executed')
    expect(
      inspectModelReport({ ...result, results: result.results.slice(1) }).scenario.matchesExpected,
    ).toBe(false)
    expect(
      inspectModelReport({ ...result, results: [...result.results, first] }).scenario
        .matchesExpected,
    ).toBe(false)
  })

  // The subject factory intentionally exceeds a real 20 ms wait.
  it(
    'keeps factory exceptions and timeouts visible and continues other checks',
    { tags: ['slow'] },
    async () => {
      let calls = 0
      const thrown = await runContractSkeleton(
        skeletonInputs({
          model: {
            subject: () => {
              calls++
              if (calls === 1) throw new Error('private-provider-text')
              return createScriptedConformanceSubject()
            },
            waitMs: 500,
          },
        }),
      )
      expect(thrown.checksPassed).toBe(false)
      expect(calls).toBe(CONFORMANCE_OBLIGATIONS.length)
      expect(
        modelFragments(thrown)
          .slice(1)
          .every(fragment => fragment.status === 'pass'),
      ).toBe(true)
      expect(JSON.stringify(thrown)).not.toContain('private-provider-text')
      let waits = 0
      const timedOut = await runContractSkeleton(
        skeletonInputs({
          model: {
            subject: () => {
              waits++
              return waits === 1
                ? new Promise<ReturnType<typeof createScriptedConformanceSubject>>(() => {})
                : createScriptedConformanceSubject()
            },
            waitMs: 20,
          },
        }),
      )
      expect(timedOut.checksPassed).toBe(false)
      expect(waits).toBe(CONFORMANCE_OBLIGATIONS.length)
      expect(modelFragments(timedOut)[0]?.status).toBe('fail')
    },
  )

  it('makes disposal failure fail the consumer and attempts every release', async () => {
    let created = 0
    let released = 0
    const report = await runContractSkeleton(
      skeletonInputs({
        model: {
          subject: () => {
            created++
            const subject = createScriptedConformanceSubject()
            return {
              ...subject,
              async dispose() {
                await subject.dispose?.()
                released++
                throw new Error('private-cleanup-detail')
              },
            }
          },
          waitMs: 500,
        },
      }),
    )
    expect(created).toBe(CONFORMANCE_OBLIGATIONS.length)
    expect(released).toBe(created)
    expect(report.checksPassed).toBe(false)
    expect(modelFragments(report).every(fragment => fragment.status === 'fail')).toBe(true)
    expect(JSON.stringify(report)).not.toContain('private-cleanup-detail')
  })

  it('keeps an unavailable conformance report attached to its hop', async () => {
    const report = await runContractSkeleton(
      skeletonInputs({ model: { subject: createScriptedConformanceSubject, waitMs: 0 } }),
    )
    expect(report.checksPassed).toBe(false)
    expect(report.hops.find(hop => hop.hopId === 'H06')?.state).toBe('failed')
    expect(modelFragments(report)).toMatchObject([{ status: 'fail' }])
    expect(
      report.scenarios
        .filter(scenario => scenario.scenarioId.startsWith('G'))
        .every(scenario => scenario.matchesExpected),
    ).toBe(true)
  })
})
