import { expect, it } from 'vitest'

it('exports the wait contract, its request and answer, the bridge and the read of the wait', async () => {
  const root = (await import('@omne-harness/dispatch-tool')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'DISPATCH_TOOL_OWNER',
    'REPORT_TEXT_ANSWER_BYTES',
    'createReportBridge',
    'createReportWaits',
    'dispatchReportWait',
    'isReportWait',
    'readReportWaitRequest',
    'reportWaitAnswer',
    'reportWaitRequest',
  ])
})
