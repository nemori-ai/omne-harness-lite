import type { Row } from './settings-machine.ts'

/** A secret that no layer holds: neither this tenant nor the deployment has put one in. */
export const lacksKey = (rows: readonly Row[]): boolean =>
  rows.some(
    row => row.view.kind === 'secret' && row.view.own === 'unset' && row.view.official === 'unset',
  )
