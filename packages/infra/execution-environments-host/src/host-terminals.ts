import { randomUUID } from 'node:crypto'
import { writeJsonLossless } from '@omne-harness-lite/content-blocks'
import type {
  CommandFacility,
  TerminalReference,
  TerminalCreateRequest,
  TerminalExecuteRequest,
} from '@omne-harness-lite/execution-environments'
import { createHostProcessCoordinate } from './native-control.ts'
import {
  prepareHostTerminal,
  prepareHostTerminalCommand,
  type HostTerminalControl,
} from './native-terminal.ts'
import type { NativeRecord } from './native-store.ts'
import type { HostOwner, HostAcquireRequest } from './host-owner.ts'
import type { HostNativePolicy } from './native-policy.ts'

interface Terminal {
  readonly reference: TerminalReference
  readonly scope: string
  readonly control: HostTerminalControl
  readonly record: NativeRecord
  busy: boolean
}
export function createHostTerminals(owner: HostOwner, policy: HostNativePolicy) {
  const terminals = new Map<string, Terminal>()
  const reservations = new Map<string, number>()
  function lookup(request: HostAcquireRequest, reference: TerminalReference) {
    const terminal = terminals.get(reference.id)
    return terminal &&
      terminal.scope === writeJsonLossless(request.scope) &&
      terminal.reference.generation === reference.generation
      ? terminal
      : undefined
  }
  async function birth(request: HostAcquireRequest, value: TerminalCreateRequest) {
    const scope = writeJsonLossless(request.scope)
    const count = [...terminals.values()].filter(
      terminal => terminal.scope === scope && terminal.control.information().state !== 'closed',
    ).length
    if (count + (reservations.get(scope) ?? 0) >= policy.maxTerminalsPerScope)
      return { kind: 'rejected' as const, reason: 'capacity' as const }
    reservations.set(scope, (reservations.get(scope) ?? 0) + 1)
    try {
      return await createReserved(request, value, scope)
    } finally {
      reservations.set(scope, reservations.get(scope)! - 1)
    }
  }
  async function createReserved(
    request: HostAcquireRequest,
    value: TerminalCreateRequest,
    scope: string,
  ) {
    const coordinate = await createHostProcessCoordinate(),
      record = await owner.original(request, 'terminal', { ...coordinate })
    if (!record) return { kind: 'rejected' as const, reason: 'closed' as const }
    const prepared = await prepareHostTerminal(value, policy, coordinate)
    if (prepared.kind === 'rejected') {
      await owner.stopped(record, request.resources, true)
      return prepared
    }
    owner.controls.set(record.resource.key, prepared.control)
    if (
      prepared.kind !== 'ready' ||
      request.resources.closed.aborted ||
      !(await owner.permit(request, record.resource.key))
    ) {
      await owner.stopped(
        record,
        request.resources,
        (await prepared.control.stop('forced')) === 'confirmed',
      )
      return { kind: 'rejected' as const, reason: 'closed' as const }
    }
    const started = await prepared.control.go()
    if (started.kind !== 'created') {
      await owner.stopped(
        record,
        request.resources,
        (await prepared.control.stop('forced')) === 'confirmed',
      )
      return started
    }
    if ((await request.resources.adopt(record.resource.key)) !== 'confirmed') {
      await owner.stopped(
        record,
        request.resources,
        (await started.terminal.stop('forced')) === 'confirmed',
      )
      return { kind: 'rejected' as const, reason: 'effectUnknown' as const }
    }
    try {
      await owner.store.change(record.resource.key, basis => ({ ...basis!, adopted: true }))
    } catch {
      await started.terminal.stop('forced')
      return { kind: 'rejected' as const, reason: 'effectUnknown' as const }
    }
    if (!owner.isActive()) {
      await owner.recover(record.resource)
      return { kind: 'rejected' as const, reason: 'closed' as const }
    }
    const reference = Object.freeze({ id: randomUUID(), generation: record.generation })
    terminals.set(reference.id, {
      reference,
      scope,
      control: started.terminal,
      record,
      busy: false,
    })
    owner.controls.set(record.resource.key, started.terminal)
    return { kind: 'created' as const, terminal: reference }
  }
  async function cancelLeg(
    terminal: Terminal,
    record: NativeRecord,
    request: HostAcquireRequest,
    control: import('./native-control.ts').HostRecoveryControl,
  ) {
    control.closePermission()
    const confirmed = (await control.stop('forced')) === 'confirmed'
    if (await owner.stopped(record, request.resources, confirmed)) terminal.busy = false
  }
  async function settleLeg(
    terminal: Terminal,
    record: NativeRecord,
    request: HostAcquireRequest,
    process: import('@omne-harness-lite/execution-environments').ProcessHandle,
  ) {
    const outcome = await process.result
    const confirmed =
      outcome.kind === 'completed' || (await terminal.control.stop('forced')) === 'confirmed'
    if (outcome.kind === 'completed')
      await owner.store.change(record.resource.key, basis => ({ ...basis!, completed: true }))
    const acknowledged = await owner.stopped(record, request.resources, confirmed)
    if (acknowledged) {
      terminal.busy = false
      owner.controls.delete(record.resource.key)
    } else await terminal.control.stop('forced')
    return outcome
  }
  async function legPermitted(
    request: HostAcquireRequest,
    record: NativeRecord,
    prepared: import('./native-control.ts').HostPreparation<
      import('./native-command.ts').HostPreparedProcess
    >,
  ) {
    return prepared.kind === 'ready' && (await owner.permit(request, record.resource.key))
  }
  async function execute(request: HostAcquireRequest, value: TerminalExecuteRequest) {
    const terminal = lookup(request, value.terminal)
    if (!terminal) return { kind: 'rejected' as const, reason: 'notFound' as const }
    if (terminal.busy) return { kind: 'rejected' as const, reason: 'busy' as const }
    if (terminal.control.information().state !== 'idle')
      return { kind: 'rejected' as const, reason: 'closed' as const }
    terminal.busy = true
    const record = await owner.original(
      request,
      'leg',
      { ...terminal.control.coordinate, terminal: terminal.record.resource.key },
      { terminal: terminal.record.resource.key },
    )
    if (!record) {
      terminal.busy = false
      return { kind: 'rejected' as const, reason: 'closed' as const }
    }
    const prepared = await prepareHostTerminalCommand(terminal.control, value, policy)
    if (prepared.kind === 'rejected') {
      terminal.busy = false
      await owner.stopped(record, request.resources, true)
      return prepared
    }
    owner.controls.set(record.resource.key, prepared.control)
    if (prepared.kind !== 'ready' || !(await legPermitted(request, record, prepared))) {
      await cancelLeg(terminal, record, request, prepared.control)
      return { kind: 'rejected' as const, reason: 'closed' as const }
    }
    if ((await prepared.control.go()) !== 'started') {
      await cancelLeg(terminal, record, request, prepared.control)
      return { kind: 'rejected' as const, reason: 'effectUnknown' as const }
    }
    const process = prepared.control.process
    const result = owner.retainFileWork(settleLeg(terminal, record, request, process))
    return { kind: 'started' as const, process: { ...process, result } }
  }
  return {
    forCall(request: HostAcquireRequest): Omit<CommandFacility, 'start'> {
      return {
        createTerminal: value => birth(request, value),
        executeTerminal: value => execute(request, value),
        async closeTerminal(reference) {
          const terminal = lookup(request, reference)
          if (!terminal) return { kind: 'rejected', reason: 'notFound' }
          const status = await terminal.control.stop('forced')
          if (status === 'confirmed') await owner.recover(terminal.record.resource)
          return { kind: 'closed', status }
        },
        async terminals() {
          const scope = writeJsonLossless(request.scope)
          return {
            kind: 'terminals',
            values: [...terminals.values()]
              .filter(terminal => terminal.scope === scope)
              .map(terminal => {
                const info = terminal.control.information()
                return {
                  terminal: terminal.reference,
                  ...info,
                  state: terminal.busy && info.state === 'idle' ? ('running' as const) : info.state,
                }
              }),
          }
        },
      }
    },
  }
}
