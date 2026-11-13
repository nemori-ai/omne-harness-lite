// The new address of the `server-entry` row (#1249 block 2, spec 已定 12 and 13): the registry, the
// identity port, the grace and the two bounds the member's `access` takes. The release mounts no
// domain's contribution, so the only protocol at the new address is the entry's own `access/v1`,
// whose one observation needs no login (RFC-0015 I-15: a contribution is not an opening).
//
// The registry is the member's plain `createAccessRegistry`, built in the row body. A Cordis
// provider would put `accessRegistry` on the tree, a service the assembly page does not list for
// this row; nothing in the release would mount on it yet.
import type { AccessIdentity } from '@omne-harness/access-cordis-contract'
import { systemScope } from '@omne-harness/legal-identity'
import {
  createAccessRegistry,
  type AccessDiagnostic,
  type AccessDiagnosticCode,
  type ServerEntryAccess,
} from '@omne-harness/server-entry'
import {
  defineEvent,
  validateFields,
  type Fields,
  type TelemetryPort,
} from '@omne-harness/telemetry-contract'
import { processInstance } from '../telemetry/instance.ts'

/** How long a handler may run after a take-down before the entry answers for it. */
const GRACE_MS = 5000
/** The bytes of one observation's frames not yet written out before it ends with `capacity`. */
const FRAME_QUEUE_BYTES = 1 << 20
/** The change frames one availability subscriber may have waiting before they become a snapshot. */
const AVAILABILITY_BACKLOG = 64

/**
 * The identity port of the new address. The release has no protocol that needs a login there, and
 * identity offers no adapter for this port yet: every method answers `basis-unavailable`, so a
 * call that would need one is refused and leaves an `access.identity-unavailable` diagnostic.
 */
const IDENTITY_NOT_OFFERED: AccessIdentity = {
  identifyLogin: async () => ({ outcome: 'basis-unavailable' }),
  actFor: async () => ({ outcome: 'basis-unavailable' }),
  reportAccess: async () => {},
}

const OWNER = 'server-entry'

/** Every code of the member's `AccessDiagnostic`, so the enum and the member's type move together. */
const CODES = [
  'access.path-rejected',
  'access.method-rejected',
  'access.host-rejected',
  'access.content-type-rejected',
  'access.not-mounted',
  'access.busy',
  'access.message-id-rejected',
  'access.identity-denied',
  'access.identity-unavailable',
  'access.identity-fault',
  'access.body-over-limit',
  'access.body-rejected',
  'access.aborted',
  'access.caller-gone',
  'access.listener-fault',
  'access.report-fault',
  'access.observation-full',
  'access.frame-source-fault',
  'access.frame-rejected',
  'access.frame-queue-full',
] as const satisfies readonly AccessDiagnosticCode[]
// A code the member adds without this table fails here, not at run time.
const exhaustive: [AccessDiagnosticCode] extends [(typeof CODES)[number]] ? true : never = true
void exhaustive

/** The event of the new address, beside `omne.entry.diagnostic` of the three locations. */
export const accessDiagnosticDefinition = defineEvent({
  owner: OWNER,
  name: 'omne.access.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    code: { kind: 'enum', values: CODES },
    path: { kind: 'ref', owner: OWNER, maxBytes: 256, optional: true },
    operation: { kind: 'ref', owner: OWNER, maxBytes: 128, optional: true },
  },
})

type AccessFields = Fields<typeof accessDiagnosticDefinition.schema>

/** The fields of one diagnostic; a reference the contract refuses is left out. */
function fieldsOf(event: AccessDiagnostic): AccessFields {
  const { code, path, operation } = event
  const admits = (fields: AccessFields): boolean =>
    validateFields(accessDiagnosticDefinition, fields).kind === 'ok'
  return {
    code,
    ...(path !== undefined && admits({ code, path }) && { path }),
    ...(operation !== undefined && admits({ code, operation }) && { operation }),
  }
}

/** The member's `access.diagnostics`, bound once at row build: system scope, as the entry's own. */
export function accessDiagnostics(telemetry: TelemetryPort): (event: AccessDiagnostic) => void {
  const emitter = telemetry.bind({
    scope: systemScope(),
    component: OWNER,
    instance: processInstance,
  })
  return event => {
    emitter.event(accessDiagnosticDefinition, fieldsOf(event))
  }
}

/** The `access` of `createServerEntry`: a fresh registry with only the entry's own protocol. */
export function entryAccess(telemetry: TelemetryPort): ServerEntryAccess {
  const diagnostics = accessDiagnostics(telemetry)
  return {
    registry: createAccessRegistry({
      onListenerError: () => diagnostics({ code: 'access.listener-fault' }),
    }),
    identity: IDENTITY_NOT_OFFERED,
    graceMs: GRACE_MS,
    frameQueueBytes: FRAME_QUEUE_BYTES,
    availabilityBacklog: AVAILABILITY_BACKLOG,
    diagnostics,
  }
}
