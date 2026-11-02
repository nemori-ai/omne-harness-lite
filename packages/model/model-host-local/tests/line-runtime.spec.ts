// @module-tag slow — runs the complete provider contract through the configured runtime and SQL records factories.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CONFORMANCE_OBLIGATIONS,
  checkModelProviderConformance,
} from '@omne-harness/model-contract/conformance'
import { expect, it } from 'vitest'
import { durableSubject, type AssemblyFacts } from './support/durable-assembly.ts'

it('keeps all 53 provider obligations through the configured runtime and SQL records factories', async () => {
  const hooks: unknown[] = []
  const assemblies: AssemblyFacts[] = []
  const report = await checkModelProviderConformance({
    subject: async () => {
      const subject = await durableSubject(event => hooks.push(event), { configured: true })
      assemblies.push(subject.facts)
      return subject
    },
    waitMs: 8000,
  })
  const out = process.env['OMNE_EVIDENCE_OUT']
  if (out) {
    mkdirSync(out, { recursive: true })
    writeFileSync(join(out, 'line-conformance.json'), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(join(out, 'line-assembly.json'), `${JSON.stringify(assemblies, null, 2)}\n`)
    writeFileSync(join(out, 'line-hooks.json'), `${JSON.stringify(hooks, null, 2)}\n`)
  }
  expect(report.results.map(row => row.obligation)).toEqual([...CONFORMANCE_OBLIGATIONS])
  expect(report.results.filter(row => row.status !== 'pass')).toEqual([])
  expect(report.ok).toBe(true)
  expect(assemblies).toHaveLength(CONFORMANCE_OBLIGATIONS.length)
  for (const facts of assemblies) {
    expect(facts.commandsKind).toBe('durable-sql')
    expect(facts.modelCommands).toContain('createSqlModelRecordsPlugin')
    expect(facts.runtimeFactory).toBe('configured')
    expect(facts.runtimeConstructions).toBe(1)
  }
}, 120_000)

it('captures concurrent configured subjects independently and closes their own send children', async () => {
  const ready = Promise.withResolvers<void>()
  let arrivals = 0
  const beforeRuntime = async () => {
    arrivals += 1
    if (arrivals === 2) ready.resolve()
    await ready.promise
  }
  const settled = await Promise.allSettled([
    durableSubject(undefined, { configured: true, beforeRuntime }),
    durableSubject(undefined, { configured: true, beforeRuntime }),
  ])
  const subjects = settled.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []))
  try {
    expect(settled.filter(result => result.status === 'rejected')).toEqual([])
    expect(subjects).toHaveLength(2)
    expect(new Set(subjects.map(subject => subject.provider.runtime)).size).toBe(2)
    for (const subject of subjects) {
      expect(subject.facts.runtimeConstructions).toBe(1)
      expect(subject.facts.plugins.some(name => name.includes('createSqlModelRecordsPlugin'))).toBe(
        true,
      )
    }
  } finally {
    await Promise.all(subjects.map(subject => subject.dispose?.()))
  }
}, 60_000)
