import { randomBytes } from 'node:crypto'
import type { OwnedRef } from '@omne-harness/telemetry-contract'

export const TELEMETRY_INSTANCE_OWNER = '@omne-harness/harness-server'

export const processInstance: OwnedRef = Object.freeze({
  owner: TELEMETRY_INSTANCE_OWNER,
  ref: randomBytes(8).toString('hex'),
})
