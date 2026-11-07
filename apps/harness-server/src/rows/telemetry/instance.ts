// The identity of this server process in telemetry: an opaque reference the assembly owns. One
// `serve` process is one instance, so the reference is drawn once, when this module loads, and the
// runtime (on every `log` record) and the rows' bindings (on every event) carry the same value.
// Several `runServe` calls in one process (tests) share it.
import { randomBytes } from 'node:crypto'
import type { OwnedRef } from '@omne-harness/telemetry-contract'

export const TELEMETRY_INSTANCE_OWNER = '@omne-harness/harness-server'

export const processInstance: OwnedRef = Object.freeze({
  owner: TELEMETRY_INSTANCE_OWNER,
  ref: randomBytes(8).toString('hex'),
})
