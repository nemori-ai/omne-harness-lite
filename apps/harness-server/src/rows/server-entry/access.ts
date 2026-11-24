import type { Context } from '@deepseek-ai/cordis'
import { scopeOfLayer } from '@omne-harness/assets'
import type { AccessIdentity } from '@omne-harness/access-cordis-contract'
import { systemScope } from '@omne-harness/legal-identity'
import type {
  AccessDiagnostic,
  AccessDiagnosticCode,
  Clock,
  ServerEntryAccess,
} from '@omne-harness/server-entry'
import { AccessRegistryProvider } from '@omne-harness/server-entry/cordis'
import {
  defineEvent,
  validateFields,
  type Fields,
  type TelemetryPort,
} from '@omne-harness/telemetry-contract'
import type { TimeSource } from '@omne-harness/time-source'
import { runTimeOf } from '../../entry/time.ts'
import { processInstance } from '../telemetry/instance.ts'

export const accessClockOf = (time: TimeSource): Clock => ({
  schedule: (ms, run, options) => time.after(ms, run, options),
})

const GRACE_MS = 5000
const FRAME_QUEUE_BYTES = 1 << 20
const AVAILABILITY_BACKLOG = 64

const OWNER = 'server-entry'

const CODES = [
  'access.path-rejected',
  'access.method-rejected',
  'access.host-rejected',
  'access.content-type-rejected',
  'access.not-mounted',
  'access.not-offered',
  'access.protocol-conflict',
  'access.registry-unavailable',
  'access.busy',
  'access.message-id-rejected',
  'access.revision-rejected',
  'access.identity-denied',
  'access.identity-unavailable',
  'access.identity-fault',
  'access.login-revoked-before-answer',
  'access.body-over-limit',
  'access.body-rejected',
  'access.aborted',
  'access.caller-gone',
  'access.listener-fault',
  'access.report-fault',
  'access.basis-unavailable',
  'access.request-fault',
  'access.observation-full',
  'access.frame-source-fault',
  'access.frame-rejected',
  'access.frame-queue-full',
] as const satisfies readonly AccessDiagnosticCode[]
const exhaustive: [AccessDiagnosticCode] extends [(typeof CODES)[number]] ? true : never = true
void exhaustive

export const accessDiagnosticDefinition = defineEvent({
  owner: OWNER,
  name: 'omne.access.diagnostic',
  version: 1,
  level: 'warn',
  schema: {
    code: { kind: 'enum', values: CODES },
    path: { kind: 'ref', owner: OWNER, maxBytes: 256, optional: true },
    operation: { kind: 'ref', owner: OWNER, maxBytes: 128, optional: true },
    by: { kind: 'ref', owner: OWNER, maxBytes: 256, optional: true },
  },
})

type AccessFields = Fields<typeof accessDiagnosticDefinition.schema>

function fieldsOf(event: AccessDiagnostic): AccessFields {
  const { code, path, operation } = event
  // The instances that hold one protocol at once, as one reference: a reference has no spaces.
  const by = event.by?.join(',')
  const admits = (fields: AccessFields): boolean =>
    validateFields(accessDiagnosticDefinition, fields).kind === 'ok'
  return {
    code,
    ...(path !== undefined && admits({ code, path }) && { path }),
    ...(operation !== undefined && admits({ code, operation }) && { operation }),
    ...(by !== undefined && admits({ code, by }) && { by }),
  }
}

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

export function entryAccess(
  ctx: Context,
  telemetry: TelemetryPort,
  identity: AccessIdentity,
): ServerEntryAccess {
  const diagnostics = accessDiagnostics(telemetry)
  return {
    registry: new AccessRegistryProvider(ctx, { diagnostics }),
    identity,
    tenantScope: tenant => scopeOfLayer('tenant', tenant),
    graceMs: GRACE_MS,
    frameQueueBytes: FRAME_QUEUE_BYTES,
    availabilityBacklog: AVAILABILITY_BACKLOG,
    clock: accessClockOf(runTimeOf(ctx)),
    diagnostics,
  }
}
