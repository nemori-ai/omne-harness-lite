import { expect, it } from 'vitest'

it('exports the protocol, the reasons, the themes and size tiers, the default mode, its bounds and how a mode is made', async () => {
  const root = (await import('@omne-harness/interface-protocol')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DEFAULT_MODE',
    'INSPECTION_REASONS',
    'MODE_BOUNDS',
    'PART_ROLES',
    'SIZE_TIERS',
    'THEMES',
    'interfaceProtocol',
    'modeOf',
  ])
})
