// @module-tag slow — builds 53 full Cordis assemblies with a SQL store each and waits on real timers.
// The 53 provider obligations of the Model contract on the full assembly: the runtime plugin of
// this member (host, runtime facade, result push), its send stage plugin, the real Model runtime
// and the durable ModelCommands of model-storage-sql, on real Cordis 4.0.4. The assembly, its
// hooks and its fault injection are in `support/durable-assembly.ts`.
//
// With `OMNE_EVIDENCE_OUT=<directory>` the case writes `conformance.json` (one row per obligation)
// and `assembly.json` (which ModelCommands, which SQL provider, the Cordis version, the plugins).
// Neither file holds a request body, a credential or an identity beyond the principal subject.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
  type ConformanceObligation,
} from '@omne-harness/model-contract/conformance'
import { expect, it } from 'vitest'
import { describeAssembly, durableSubject } from './support/durable-assembly.ts'

/**
 * The obligations this assembly cannot make applicable, each with its reason. A row in the report
 * that is not applicable and not in this table fails the case.
 */
const ALLOWED_NOT_APPLICABLE: Readonly<Partial<Record<ConformanceObligation, string>>> = {}

it('keeps the 53 provider obligations on the full assembly with the durable ModelCommands', async () => {
  const hookEvents: unknown[] = []
  const report = await checkModelProviderConformance({
    subject: () => durableSubject(event => hookEvents.push(event)),
    waitMs: 8000,
  })
  const out = process.env['OMNE_EVIDENCE_OUT']
  if (out !== undefined && out !== '') {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'conformance.json'), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(join(out, 'assembly.json'), `${JSON.stringify(describeAssembly(), null, 2)}\n`)
    writeFileSync(join(out, 'hooks.json'), `${JSON.stringify(hookEvents, null, 2)}\n`)
  }

  // Every obligation once, in the order of the contract.
  expect(report.results.map(row => row.obligation)).toEqual([...CONFORMANCE_OBLIGATIONS])
  const failed = report.results.filter(row => row.status === 'fail')
  expect(failed).toEqual([])
  const notApplicable = report.results.filter(row => row.status === 'not-applicable')
  expect(notApplicable.map(row => row.obligation).sort()).toEqual(
    Object.keys(ALLOWED_NOT_APPLICABLE).sort(),
  )
  expect(report.ok).toBe(true)
}, 600_000)

it('describes the assembly from what it built: the durable commands over the SQL storage', async () => {
  const subject = await durableSubject()
  try {
    expect(subject.facts).toEqual(describeAssembly())
    expect(subject.facts.commandsKind).toBe('durable-sql')
    expect(subject.facts.modelCommands).toContain('model-storage-sql')
    expect(subject.facts.cordis).toMatch(/^4\.0\./u)
  } finally {
    await subject.dispose?.()
  }
})
