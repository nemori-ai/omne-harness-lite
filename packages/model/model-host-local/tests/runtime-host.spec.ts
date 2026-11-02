// @module-tag slow — builds 53 full Cordis assemblies with a SQL store each and waits on real timers.
// The 53 provider obligations of the Model contract on the full assembly: the runtime plugin of
// this member (host, runtime facade, result push), its send stage plugin, the real Model runtime
// and the durable ModelCommands of model-storage-sql, on real Cordis 4.0.4. The assembly, its
// hooks and its fault injection are in `support/durable-assembly.ts`.
//
// With `OMNE_EVIDENCE_OUT=<directory>` the case writes `conformance.json` (one row per obligation),
// `assembly.json` (which ModelCommands, which SQL provider, the Cordis version, the plugins, as the
// built subject reports them) and `hooks.json` (the hook calls). None holds a request body, a
// credential or an identity beyond the principal subject.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
  type ConformanceObligation,
} from '@omne-harness/model-contract/conformance'
import { expect, it } from 'vitest'
import { durableSubject, type AssemblyFacts } from './support/durable-assembly.ts'

/**
 * The obligations this assembly cannot make applicable, each with its reason. A row in the report
 * that is not applicable and not in this table fails the case.
 */
const ALLOWED_NOT_APPLICABLE: Readonly<Partial<Record<ConformanceObligation, string>>> = {}

/**
 * Obligations that fail today for a reason outside this member, each with the reason and the text
 * its failure must carry. Any other failure, or one of these failing for another reason, fails the
 * case. The dispatcher turns a row into a pass assertion when its closure lands (2026-11-02).
 */
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

  // Every obligation once, in the order of the contract.
  expect(report.results.map(row => row.obligation)).toEqual([...CONFORMANCE_OBLIGATIONS])
  // No failure beyond the known ones, and each known one fails for its known reason.
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
  // The report is about the durable commands, as the built subject says.
  expect(facts?.commandsKind).toBe('durable-sql')
}, 600_000)

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
})
