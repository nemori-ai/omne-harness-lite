import { expect, it } from 'vitest'
import { evidencePath } from '../src/evidence-path.ts'

it('verification.evidence-root-preserves-default-and-fences-configured-output', () => {
  expect(evidencePath('/repo', 'tmp/legacy', 'area', {})).toBe('/repo/tmp/legacy')
  expect(
    evidencePath('/repo', 'tmp/legacy', 'area', {
      OMNE_CORE_VERIFICATION_EVIDENCE_ROOT: 'tmp/run',
    }),
  ).toBe('/repo/tmp/run/area')
  for (const root of ['', '/elsewhere/tmp', '../repo-other/tmp', 'tmp/../../outside'])
    expect(() =>
      evidencePath('/repo', 'tmp/legacy', 'area', { OMNE_CORE_VERIFICATION_EVIDENCE_ROOT: root }),
    ).toThrow(/evidence root/)
})
