import type { Qualification, StandingRequest, StandingReservations } from '@omne-harness/identity'
import type { SqlIdentity } from '@omne-harness/sql-contract'
import { canonical, digest, equal, json } from './encoding.ts'
import {
  CATALOG_CAPTURES,
  CATALOG_TERMINAL,
  catalogCapturesPageSchema,
} from './catalog-terminal-schema.ts'
import type { OperationBinding } from './schema.ts'
import { terminalKey } from './terminal-record.ts'
import type { SettingsSqlTerminalOptions } from './terminal-schema.ts'

export type CaptureCustody = SettingsSqlTerminalOptions &
  Readonly<{
    destination: string
    required: readonly Qualification[]
    reservations: StandingReservations
    warn?: (message: string) => void
  }>

const settingsIdentity = (
  custody: CaptureCustody,
  operation: string,
  operationKey: string,
): SqlIdentity => ({ ...custody.domain, operation, protocolVersion: '2', operationKey })

export const captureIdentity = (custody: CaptureCustody, capture: OperationBinding) =>
  settingsIdentity(custody, 'settings.capture', digest([capture.principalRef, capture.operationId]))

export function captureRequest(custody: CaptureCustody, capture: OperationBinding) {
  return {
    required: custody.required,
    binding: {
      version: 'standing/1',
      owner: 'settings',
      operationId: capture.operationId,
      principalRef: capture.principalRef,
      destination: custody.destination,
      scopeRef: capture.domain.scope.kind === 'tenant' ? capture.domain.scope.tenant : '',
      targetRef: canonical(capture.subject),
      inputDigest: capture.commandDigest,
    },
  } satisfies StandingRequest
}

async function removeCapture(custody: CaptureCustody, capture: OperationBinding) {
  const result = await custody.storage
    .commit({
      identity: {
        ...settingsIdentity(custody, 'settings.catalog-release', terminalKey(capture)),
        recall: 'never',
      },
      combinationVersion: custody.combinationVersion,
      manifestDigest: custody.manifestDigest,
      commands: [
        {
          participant: CATALOG_TERMINAL.participant,
          facts: { kind: 'release', binding: json(capture) },
        },
      ],
      releases: [
        captureIdentity(custody, capture),
        settingsIdentity(custody, 'settings.catalog-seal', terminalKey(capture)),
      ],
    })
    .catch(() => undefined)
  if (result?.kind !== 'committed')
    custody.warn?.(`settings catalog capture kept its records: ${result?.kind ?? 'unavailable'}`)
}

export async function releaseCapture(custody: CaptureCustody, capture: OperationBinding) {
  const released = await custody.reservations
    .release(captureRequest(custody, capture))
    .catch(() => undefined)
  if (released?.kind === 'released') return removeCapture(custody, capture)
  custody.warn?.(
    `settings catalog capture kept its reservation: ${released?.kind ?? 'unavailable'}`,
  )
}

async function recoverCapture(custody: CaptureCustody, capture: OperationBinding) {
  const request = captureRequest(custody, capture)
  const observed = await custody.reservations.observe(request).catch(() => undefined)
  if (observed?.kind === 'not_found') return removeCapture(custody, capture)
  const settled =
    observed?.kind === 'held' || observed?.kind === 'terminal'
      ? await custody.reservations.settle(request).catch(() => undefined)
      : observed
  if (settled?.kind === 'terminal') return releaseCapture(custody, capture)
  custody.warn?.(`settings catalog capture not recovered: ${settled?.kind ?? 'unavailable'}`)
}

async function capturePage(custody: CaptureCustody, after: string | null) {
  const read = await custody.storage
    .read({
      domain: custody.domain,
      ...CATALOG_CAPTURES,
      requestKey: digest(['catalog-captures', after]),
      input: { after },
    })
    .catch(() => undefined)
  const page = read?.kind === 'read' ? catalogCapturesPageSchema.safeParse(read.output) : undefined
  return page?.success ? page.data : undefined
}

export async function recoverCaptures(custody: CaptureCustody, deploymentRef: string) {
  let after: string | null = null
  do {
    const page = await capturePage(custody, after)
    if (page === undefined) return custody.warn?.('settings catalog captures not read')
    for (const { record } of page.items)
      if (
        equal(record.binding.domain, custody.domain) &&
        record.binding.subject.kind === 'catalog-capture' &&
        record.binding.subject.deploymentRef === deploymentRef
      )
        await recoverCapture(custody, record.binding)
    after = page.next
  } while (after !== null)
}
