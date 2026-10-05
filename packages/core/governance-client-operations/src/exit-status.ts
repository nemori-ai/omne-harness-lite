import type { ActionReport } from './types.ts'

export function exitStatus(report: ActionReport): 0 | 2 | 3 | 4 | 5 | 70 {
  if (
    report.defect !== undefined ||
    report.local.status === 'defect' ||
    report.admission.reason === 'defect'
  )
    return 70
  if (['conflict', 'not-installed', 'unconfirmed'].includes(report.local.status)) return 5
  if (
    report.remote.status === 'unknown' ||
    (report.remote.status === 'unavailable' && report.view.source !== 'copy')
  )
    return 3
  if (
    report.remote.status === 'rejected' ||
    report.use === 'reenter-required' ||
    report.admission.reason === 'not-logged-in'
  )
    return 4
  if (report.admission.status === 'blocked')
    return report.admission.reason === 'local-unavailable' ? 3 : 2
  return 0
}
