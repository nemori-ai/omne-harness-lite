import { expect, it } from 'vitest'

it('exports the values, the table of transitions, the pure decisions and the request schemas', async () => {
  const root = (await import('@omne-harness/dispatch-contract')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DISPATCH_MODES',
    'DISPATCH_STATES',
    'MAX_DISPATCH_DEPTH',
    'OPEN_STATES',
    'TEXT_CEILING',
    'decideAccept',
    'decideMessage',
    'deliveryDue',
    'deliverySchema',
    'dispatchIdSchema',
    'dispatchRequestSchema',
    'dispatchSchema',
    'failureSchema',
    'instantSchema',
    'isOpen',
    'messageRequestSchema',
    'modeSchema',
    'reportSchema',
    'reportTextSchema',
    'sessionRefSchema',
    'settleSecondPlace',
    'settleWait',
    'stateSchema',
    'stopSchema',
    'tenantIdSchema',
    'transition',
  ])
})
