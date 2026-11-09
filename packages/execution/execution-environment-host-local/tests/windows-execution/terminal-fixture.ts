import { randomUUID } from 'node:crypto'
import { onTestFinished } from 'vitest'
import { decodeScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  ManagedResource,
  ProcessHandle,
  ResourceLedger,
  TerminalFacility,
} from '@omne-harness/execution-environment-contract'
import { terminalSettings, type HostTerminalOptions } from '../../src/host-terminal.ts'
import {
  createWindowsHostTerminals,
  createWindowsTerminalCapacity,
} from '../../src/windows-execution/terminal.ts'
import { commandFixture } from './fixture.ts'

export function terminalFixture(cwd: string, options: HostTerminalOptions = {}) {
  const identity = commandFixture(cwd).request
  const scope = decodeScopeRef({ ref: `terminal-${randomUUID()}` })
  if (!('ok' in scope)) throw new Error('scope fixture')
  const plans: ManagedResource[] = []
  const controller = new AbortController()
  const ledger: ResourceLedger = {
    closed: controller.signal,
    plan: async resource => {
      plans.push(resource)
      return 'recorded'
    },
    permit: async () => 'confirmed',
    adopt: async () => 'confirmed',
    stopped: async () => 'recorded',
  }
  const settings = terminalSettings({ startBoundMs: 20_000, ...options })
  const capacity = createWindowsTerminalCapacity({
    maxTerminals: 8,
    maxWindows: 16,
    maxReservedBytes: 16 * settings.maxBufferedBytes,
    maxChunks: 4096,
  })
  const input = { ledger, scope: scope.ok, provider: 'windows-test', settings, capacity }
  const manager = createWindowsHostTerminals(input)
  onTestFinished(async () => {
    await manager.stopAll()
  })
  const request: Parameters<TerminalFacility<unknown>['create']>[0] = {
    requestId: randomUUID(),
    access: identity.access,
    origin: identity.origin,
    binding: identity.binding,
    cwd,
    env: { SystemRoot: process.env['SystemRoot'] ?? 'C:\\Windows', TEMP: cwd, TMP: cwd },
  }
  const call = {
    requestId: request.requestId,
    access: request.access,
    origin: request.origin,
    binding: request.binding,
  }
  return { input, manager, request, call, plans, controller, capacity }
}

export async function outputOf(handle: ProcessHandle) {
  const chunks = []
  for await (const chunk of handle.output) chunks.push(chunk)
  return { chunks, bytes: Buffer.concat(chunks.map(chunk => Buffer.from(chunk.data))) }
}

/** CSI, OSC ended by BEL or ST, and the other escape sequences ConPTY renders around the text. */
const escapes =
  // oxlint-disable-next-line no-control-regex -- ConPTY output is matched without its escapes.
  /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[ -/]*[0-~]/gu

/** The text of terminal bytes, without the control sequences ConPTY renders around it. */
export const visible = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString('utf8').replace(escapes, '')

export const psString = (value: string) => `'${value.replaceAll("'", "''")}'`
