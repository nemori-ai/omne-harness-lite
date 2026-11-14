// @module-tag slow — builds 53 full Cordis assemblies with a SQL store each and waits on real timers.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
  type ConformanceObligation,
} from '@omne-harness/model-contract/conformance'
import { expect, it } from 'vitest'
import { durableSubject, type AssemblyFacts } from './support/durable-assembly.ts'

const ALLOWED_NOT_APPLICABLE: Readonly<Partial<Record<ConformanceObligation, string>>> = {}

const KNOWN_FAILING: Readonly<
  Partial<Record<ConformanceObligation, Readonly<{ reason: string; detail: string }>>>
> = {}

it('keeps the 53 provider obligations on the full assembly with the durable ModelCommands', async () => {
  const hookEvents: unknown[] = []
  let facts: AssemblyFacts | undefined
  const report = await checkModelProviderConformance({
    subject: async () => {
      const subject = await durableSubject(event => hookEvents.push(event))
      facts = subject.facts
      return subject
    },
    waitMs: 8000,
  })
  const out = process.env['OMNE_EVIDENCE_OUT']
  if (out !== undefined && out !== '') {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'conformance.json'), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(join(out, 'assembly.json'), `${JSON.stringify(facts ?? null, null, 2)}\n`)
    writeFileSync(join(out, 'hooks.json'), `${JSON.stringify(hookEvents, null, 2)}\n`)
  }

  expect(report.results.map(row => row.obligation)).toEqual([...CONFORMANCE_OBLIGATIONS])
  const failed = report.results.filter(row => row.status === 'fail')
  const unexpected = failed.filter(row => {
    const known = KNOWN_FAILING[row.obligation]
    return known === undefined || !row.detail.includes(known.detail)
  })
  expect(unexpected).toEqual([])
  expect(failed.map(row => row.obligation).sort()).toEqual(Object.keys(KNOWN_FAILING).sort())
  const notApplicable = report.results.filter(row => row.status === 'not-applicable')
  expect(notApplicable.map(row => row.obligation).sort()).toEqual(
    Object.keys(ALLOWED_NOT_APPLICABLE).sort(),
  )
  expect(report.ok).toBe(Object.keys(KNOWN_FAILING).length === 0)
  expect(facts?.commandsKind).toBe('durable-sql')
}, 120_000)

it('reports the assembly from what it built: the durable commands over the SQL storage, Cordis 4.0.x', async () => {
  const subject = await durableSubject()
  try {
    expect(subject.facts.commandsKind).toBe('durable-sql')
    expect(subject.facts.modelCommands).toContain('@omne-harness/model-storage-sql')
    expect(subject.facts.cordis).toMatch(/^4\.0\./u)
    expect(subject.facts.plugins.some(name => name.startsWith('ModelRuntimeLocalPlugin'))).toBe(
      true,
    )
    expect(subject.facts.plugins.some(name => name.startsWith('ModelSendStagePlugin'))).toBe(true)
  } finally {
    await subject.dispose?.()
  }
}, 60_000)
