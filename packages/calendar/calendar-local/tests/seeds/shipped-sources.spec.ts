import { describe, expect, it } from 'vitest'
import { instantSchema } from '@omne-harness/calendar-contract'
import { createCalendarSourceAdapters, shippedCalendarSupplyInputs } from '../../src/index.ts'

const OFFLINE = ['gov-cn-annual-notice', 'usc-6103-computed-rules', 'vacanza-holidays-library']
const acquiredAt = instantSchema.parse('2026-11-19T00:00:00.000Z')

describe('the supply inputs shipped with the release', () => {
  it('lets every offline source acquire its shipped material without the network', async () => {
    const inputs = shippedCalendarSupplyInputs()
    const httpClient = () => Promise.reject(new Error('no network in this test'))
    const adapters = createCalendarSourceAdapters({ ...inputs.sourceOptions, httpClient })
    for (const sourceId of OFFLINE) {
      const adapter = adapters.find(item => item.sourceId === sourceId)
      const result = await adapter?.acquire({ acquiredAt })
      expect(result, sourceId).toMatchObject({ kind: 'acquired' })
    }
  })

  it('carries the independence registry the seed was validated against', () => {
    const { independenceRegistry } = shippedCalendarSupplyInputs()
    expect(independenceRegistry).toHaveLength(4)
    expect(independenceRegistry).toContainEqual(
      expect.objectContaining({
        truthSourceId: 'usc-6103-computed-rules',
        oracleSourceId: 'opm-federal-holidays-ics',
        independent: true,
      }),
    )
  })

  it('accepts the shipped seventy-three-year Japanese window but refuses an inverted one', async () => {
    const inputs = shippedCalendarSupplyInputs()
    const vacanza = inputs.sourceOptions.vacanzaArtifact
    if (!vacanza) throw new Error('no vacanza artifact')
    expect(vacanza.endYear - vacanza.startYear + 1).toBe(73)
    const inverted = { ...vacanza, startYear: vacanza.endYear, endYear: vacanza.startYear }
    const adapter = createCalendarSourceAdapters({
      ...inputs.sourceOptions,
      vacanzaArtifact: inverted,
    }).find(item => item.sourceId === 'vacanza-holidays-library')
    expect(await adapter?.acquire({ acquiredAt })).toMatchObject({ kind: 'unavailable' })
  })

  it('refuses an artifact whose bytes no longer match the shipped digest', async () => {
    const inputs = shippedCalendarSupplyInputs()
    const vacanza = inputs.sourceOptions.vacanzaArtifact
    if (!vacanza) throw new Error('no vacanza artifact')
    const tampered = { ...vacanza, sha256: '0'.repeat(64) }
    const adapter = createCalendarSourceAdapters({
      ...inputs.sourceOptions,
      vacanzaArtifact: tampered,
    }).find(item => item.sourceId === 'vacanza-holidays-library')
    expect(await adapter?.acquire({ acquiredAt })).toMatchObject({ kind: 'unavailable' })
  })
})
