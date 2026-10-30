import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runContractSkeleton } from '../src/index.ts'
import { aggregatePath, HOP_IDS, RESIDUAL_GAPS } from '../src/path-report.ts'
import { REQUIRED_SCENARIOS } from '../src/scenarios.ts'
import { modelFragments, pathDependencies, skeletonInputs } from './first-path-doubles.ts'

type GapRow = Readonly<{ gapId: string; blocking: boolean; owners: readonly number[] }>

/** The rows of the residual gap table of a README: gap id, blocking column, owner cards. */
function gapTable(text: string): readonly GapRow[] {
  return text
    .split('\n')
    .filter(line => /^\| \[GAP-[A-Z-]+\]/.test(line))
    .map(line => {
      const cells = line.split('|').map(cell => cell.trim())
      const gapId = /GAP-[A-Z-]+/.exec(cells[1] ?? '')?.[0] ?? ''
      const blocking = cells[2] ?? ''
      if (!['no', '否', 'yes', '是'].includes(blocking))
        throw new Error(`blocking cell ${blocking}`)
      const owners = [...(cells[3] ?? '').matchAll(/\[#(\d+)\]/g)].map(match => Number(match[1]))
      return { gapId, blocking: blocking === 'yes' || blocking === '是', owners }
    })
}

const cardOf = (url: string) => Number(/\/issues\/(\d+)$/.exec(url)?.[1])
/** The hops a blocking residual gap names on this track. */
const BLOCKED: readonly string[] = ['H09', 'H10', 'H11', 'H12', 'H13']

describe('M2 path observations', () => {
  it('keeps the gap tables of README and README_ZH equal to RESIDUAL_GAPS', () => {
    const expected = RESIDUAL_GAPS.map(gap => ({
      gapId: gap.gapId,
      blocking: gap.blocking,
      owners: gap.owners.map(cardOf),
    }))
    for (const document of ['../README.md', '../README_ZH.md'])
      expect(gapTable(readFileSync(new URL(document, import.meta.url), 'utf8'))).toEqual(expected)
  })

  it('reports the first round verified, the probed hops as blocked gaps, and the residual gaps of SPEC and README', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    expect(report.hops.map(hop => hop.hopId)).toEqual([...HOP_IDS])
    expect(report.scenarios.map(result => result.scenarioId)).toEqual([...REQUIRED_SCENARIOS])
    expect(report.checksPassed).toBe(false)
    expect(report.hops.map(hop => hop.state)).toEqual(
      HOP_IDS.map(hopId => (BLOCKED.includes(hopId) ? 'gap' : 'verified')),
    )
    expect(report.fullPath).toBe('incomplete')
    expect(report.gaps).toEqual([...BLOCKED])
    expect(report.residualGaps).toHaveLength(10)
    // Owners are open cards only; a gap without an open implementation card names M2 (#784).
    expect(
      Object.fromEntries(report.residualGaps.map(gap => [gap.gapId, gap.owners.map(cardOf)])),
    ).toEqual({
      'GAP-SESSION-WIRE': [784],
      'GAP-SESSION-COORDINATOR': [784],
      'GAP-RUN-COMPLETED': [784],
      'GAP-AGENT-CONTEXT': [542],
      'GAP-RECEIVE-SURFACE': [502, 795],
      'GAP-SECOND-RUN': [784, 502],
      'GAP-TOOL-LOOP': [520, 524, 525, 526, 528],
      'GAP-AGENT-REASSEMBLY': [502],
      'GAP-REASONING-REPLAY': [502],
      'GAP-SESSION-LOG-TARGETS': [784],
    })
    expect(report.residualGaps.filter(gap => gap.blocking).map(gap => gap.gapId)).toEqual([
      'GAP-SECOND-RUN',
      'GAP-TOOL-LOOP',
      'GAP-AGENT-REASSEMBLY',
      'GAP-REASONING-REPLAY',
      'GAP-SESSION-LOG-TARGETS',
    ])
    for (const hop of report.hops.filter(hop => BLOCKED.includes(hop.hopId))) {
      expect(hop.blockedBy.length).toBeGreaterThan(0)
      // The probe reached the hop and recorded the refusal it met; the evidence is not empty.
      expect(hop.fragments[0]?.status).toBe('fail')
      expect(hop.fragments[0]?.evidence).not.toContain('not-reached')
    }
    const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8')
    for (const document of ['../README.md', '../README_ZH.md']) {
      const text = readFileSync(new URL(document, import.meta.url), 'utf8')
      for (const gap of report.residualGaps) expect(text).toContain(gap.gapId)
    }
    for (const gap of report.residualGaps) {
      expect(gap.owners.length).toBeGreaterThan(0)
      expect(spec).toContain(`## ${gap.gapId}`)
      expect(gap.reason).toBe(`SPEC.md#${gap.gapId.toLowerCase()}`)
    }
    for (const hop of report.hops) {
      expect(hop.ownerCards.length).toBeGreaterThan(0)
      expect(hop.publicEntry.length).toBeGreaterThan(0)
      expect(hop.reason).toBe(`SPEC.md#${hop.hopId.toLowerCase()}`)
      expect(spec).toContain(`## ${hop.hopId}`)
    }
    const text = JSON.stringify(report)
    const { login } = pathDependencies()
    for (const secret of [
      'fixed-test-credential',
      'fixed-test-proof',
      'fixed-response-proof',
      login.credential,
      login.loginIdentifier,
    ])
      expect(text).not.toContain(secret)
  })

  it('makes a missing hop explicit and retains duplicate diagnostics', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    const missing = aggregatePath({
      ...report,
      hops: report.hops.filter(hop => hop.hopId !== 'H04'),
    })
    expect(missing.hops.find(hop => hop.hopId === 'H04')).toMatchObject({ state: 'gap' })
    expect(missing.structureErrors).toContain('missing-hop:H04')
    expect(missing.checksPassed).toBe(false)
    expect(missing.fullPath).toBe('incomplete')
    const h06 = report.hops.find(hop => hop.hopId === 'H06')
    if (h06 === undefined) throw new Error('H06 missing')
    const duplicate = aggregatePath({ ...report, hops: [...report.hops, h06] })
    expect(duplicate.structureErrors).toContain('duplicate-hop:H06:2')
    expect(duplicate.duplicateObservations).toEqual([h06, h06])
    expect(duplicate.hops.map(hop => hop.hopId)).toEqual([...HOP_IDS])
    expect(duplicate.checksPassed).toBe(false)
    expect(duplicate.fullPath).toBe('incomplete')
  })

  it('checks structure even when every supplied observation claims verified', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    const hops = report.hops.map(hop => ({
      ...hop,
      state: 'verified' as const,
      fragments:
        hop.fragments.length > 0
          ? hop.fragments.map(fragment => ({ ...fragment, status: 'pass' as const }))
          : [
              {
                fragmentId: 'hypothetical-connection',
                status: 'pass' as const,
                evidence: hop.publicEntry,
              },
            ],
    }))
    const unblocked = report.residualGaps.map(gap => ({ ...gap, blocking: false }))
    expect(aggregatePath({ ...report, hops, residualGaps: unblocked }).fullPath).toBe('complete')
    // A supplied observation cannot claim a hop verified while a blocking gap names it.
    const reblocked = unblocked.map(gap =>
      gap.gapId === 'GAP-RECEIVE-SURFACE' ? { ...gap, blocking: true } : gap,
    )
    const claimed = aggregatePath({ ...report, hops, residualGaps: reblocked })
    expect(claimed.fullPath).toBe('incomplete')
    expect(claimed.gaps).toEqual(['H06'])
    const missing = aggregatePath({
      ...report,
      hops: hops.filter(hop => hop.hopId !== 'H04'),
      residualGaps: unblocked,
    })
    expect(missing.fullPath).toBe('incomplete')
    expect(missing.checksPassed).toBe(false)
    const h06 = hops.find(hop => hop.hopId === 'H06')
    if (h06 === undefined) throw new Error('H06 missing')
    expect(aggregatePath({ ...report, hops: [...hops, h06] }).fullPath).toBe('incomplete')
    const uncovered = hops.map(hop =>
      hop.hopId === 'H06' ? { ...hop, fragments: hop.fragments.slice(1) } : hop,
    )
    expect(aggregatePath({ ...report, hops: uncovered }).fullPath).toBe('incomplete')
    expect(aggregatePath({ ...report, hops: uncovered }).checksPassed).toBe(false)
  })

  it('rejects missing, repeated and unexecuted fixed scenarios', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    const first = report.scenarios[0]
    if (first === undefined) throw new Error('No scenarios')
    for (const scenarios of [
      report.scenarios.slice(1),
      [...report.scenarios, first],
      report.scenarios.map(result =>
        result === first ? { ...result, status: 'exception' as const } : result,
      ),
    ]) {
      expect(aggregatePath({ ...report, scenarios }).checksPassed).toBe(false)
    }
  })

  it('does not let Model passes cover failed or uncovered required fragments', async () => {
    const report = await runContractSkeleton(skeletonInputs())
    for (const status of ['fail', 'not-applicable'] as const) {
      const hops = report.hops.map(hop => ({
        ...hop,
        state: 'verified' as const,
        fragments: [
          {
            fragmentId: 'observed-public-entry',
            status: hop.hopId === 'H04' ? status : ('pass' as const),
            evidence: hop.publicEntry,
          },
        ],
      }))
      expect(aggregatePath({ ...report, hops }).fullPath).toBe('incomplete')
      expect(aggregatePath({ ...report, hops }).checksPassed).toBe(false)
    }
    const failed = report.hops.map(hop =>
      hop.hopId === 'H04' ? { ...hop, state: 'failed' as const } : hop,
    )
    expect(aggregatePath({ ...report, hops: failed }).checksPassed).toBe(false)
  })

  it('keeps independent Model evidence when a governance call fails', async () => {
    const report = await runContractSkeleton(
      skeletonInputs({ governance: { registrationResponseBytes: new TextEncoder().encode('{') } }),
    )
    expect(report.checksPassed).toBe(false)
    expect(report.hops.find(hop => hop.hopId === 'H01')?.state).toBe('failed')
    expect(modelFragments(report).every(fragment => fragment.status === 'pass')).toBe(true)
    expect(report.hops.map(hop => hop.hopId)).toEqual([...HOP_IDS])
    expect(report.fullPath).toBe('incomplete')
  })
})
