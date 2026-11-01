import { describe, expect, it } from 'vitest'
import {
  createScriptedModelRuntimeHost,
  modelResultReceiverConformance,
  type ModelResultReceiverFixture,
} from '../src/testing/index.ts'
import { createReferenceTable, DEFECTS, type Defect } from './receivers-reference.ts'

function fixtureFor(defect: Defect | 'real' | 'reference'): ModelResultReceiverFixture {
  return {
    create: () =>
      createScriptedModelRuntimeHost(
        defect === 'real'
          ? {}
          : { table: createReferenceTable(defect === 'reference' ? undefined : defect) },
      ),
  }
}

async function failures(defect: Defect | 'real' | 'reference'): Promise<string[]> {
  const failed: string[] = []
  for (const test of modelResultReceiverConformance(fixtureFor(defect))) {
    try {
      await test.run()
    } catch {
      failed.push(test.name)
    }
  }
  return failed.sort()
}

// The cases that hold the rule that each defect breaks. A defect can also turn a neighbouring
// case red; the list is the exact set, so a case that stops noticing its defect shows here.
const EXPECTED_RED: Record<Defect, readonly string[]> = {
  'overwrite-live': ['live-conflict-fails-the-second'],
  'refuse-unloading': ['unloading-registration-is-replaced'],
  'removal-deletes-successor': [
    'removal-is-synchronous-and-own',
    'unloading-registration-is-replaced',
  ],
  'sticky-registration': [
    'fiber-unload-removes-the-registration',
    'rerun-registers-again-without-failing',
    'unloading-registration-is-replaced',
  ],
  'accept-malformed': ['malformed-input-is-refused'],
}

describe('result receiver conformance', () => {
  it('has seven cases with distinct names and non-empty clauses', () => {
    const cases = modelResultReceiverConformance(fixtureFor('real'))
    expect(cases).toHaveLength(7)
    expect(new Set(cases.map(c => c.name)).size).toBe(7)
    expect(cases.every(c => c.clause.length > 0)).toBe(true)
  })

  it('the scripted host with the real table passes every case', async () => {
    expect(await failures('real')).toEqual([])
  })

  it('an independent reference table passes every case', async () => {
    expect(await failures('reference')).toEqual([])
  })

  it.each(DEFECTS)('defect %s turns its cases red and no other', async defect => {
    expect(await failures(defect)).toEqual([...EXPECTED_RED[defect]].sort())
  })
})
