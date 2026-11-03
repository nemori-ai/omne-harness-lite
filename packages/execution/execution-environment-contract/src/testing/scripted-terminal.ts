import { randomUUID } from 'node:crypto'
import type { FacilityResult, ProcessHandle, TerminalFacility, TerminalRef } from '../index.ts'
import type { ScriptedCommandAnswer } from './scripted-command.ts'
import {
  createScriptedProcess,
  type ScriptedProcess,
  type ScriptedStopRecord,
} from './scripted-process.ts'

type ExecuteRequest<P> = Parameters<TerminalFacility<P>['execute']>[0]
export type ScriptedTerminalAnswer =
  | (Extract<ScriptedCommandAnswer, { kind: 'started' }> & { readonly observedCwd?: string })
  | Exclude<ScriptedCommandAnswer, { kind: 'started' }>
export type TerminalScript<P = unknown> = (
  request: ExecuteRequest<P>,
  base: Readonly<{ observedCwd: string; env: Readonly<Record<string, string>> }>,
) => ScriptedTerminalAnswer | Promise<ScriptedTerminalAnswer>

export type ScriptedTerminalFacility<P = unknown> = Readonly<{
  durability: 'none'
  facility: TerminalFacility<P>
  /** Requests passed to the execution script. Rejected references and busy terminals are absent. */
  calls: readonly ExecuteRequest<P>[]
  stops: readonly ScriptedStopRecord[]
  /** Refuse new facility operations. Existing handles and explicit controls remain usable. */
  close(): void
  /** Observe loss of this terminal. It cannot execute again, even after a late process result. */
  invalidate(terminal: TerminalRef): void
  /** Observe the scripted leg exiting, including after an unconfirmed stop. Starts nothing. */
  finish(terminal: TerminalRef): Promise<void>
}>

type State =
  | { kind: 'idle' }
  | { kind: 'running'; execution: Promise<ScriptedProcess | null> }
  | { kind: 'invalid'; execution: Promise<ScriptedProcess | null> | null }
  | { kind: 'closed' }
type Terminal = {
  ref: TerminalRef
  observedCwd: string
  env: Readonly<Record<string, string>>
  state: State
}

/** One non-durable acquisition. Scripts describe observations, never interpret shell text. */
export function createScriptedTerminalFacility<P = unknown>(
  script: TerminalScript<P>,
): ScriptedTerminalFacility<P> {
  const namespace = randomUUID()
  const terminals = new Map<string, Terminal>()
  const calls: ExecuteRequest<P>[] = []
  const stops: ScriptedStopRecord[] = []
  let closed = false
  let processes = 0

  function find(ref: TerminalRef): Terminal | undefined {
    const terminal = terminals.get(ref.id)
    return terminal?.ref.generation === ref.generation ? terminal : undefined
  }
  function reject(
    requestId: string,
    reason: 'invalidInput' | 'closed' | 'busy' | 'unsupported',
  ): FacilityResult<never> {
    return { kind: 'rejected', requestId, reason }
  }
  function required(ref: TerminalRef): Terminal {
    const terminal = find(ref)
    if (!terminal)
      throw new TypeError(
        'scripted terminal: reference belongs to another acquisition or generation',
      )
    return terminal
  }

  async function execute(request: ExecuteRequest<P>): Promise<FacilityResult<ProcessHandle>> {
    if (closed) return reject(request.requestId, 'closed')
    const terminal = find(request.terminal)
    if (!terminal) return reject(request.requestId, 'invalidInput')
    if (terminal.state.kind === 'closed') return reject(request.requestId, 'closed')
    if (terminal.state.kind === 'invalid') return reject(request.requestId, 'invalidInput')
    if (terminal.state.kind === 'running') return reject(request.requestId, 'busy')
    const started = Promise.withResolvers<ScriptedProcess | null>()
    const running: State = { kind: 'running', execution: started.promise }
    terminal.state = running
    calls.push(request)
    try {
      const answer = await script(request, {
        observedCwd: terminal.observedCwd,
        env: { ...terminal.env },
      })
      switch (answer.kind) {
        case 'rejected':
          if (terminal.state === running) terminal.state = { kind: 'idle' }
          started.resolve(null)
          return { kind: 'rejected', requestId: request.requestId, reason: answer.reason }
        case 'unknown':
          terminal.state = { kind: 'invalid', execution: null }
          started.resolve(null)
          return { kind: 'unknown', requestId: request.requestId }
        case 'started': {
          const process = createScriptedProcess({
            mode: 'terminal',
            answer,
            identity: { id: `${namespace}-process-${++processes}`, generation: '1' },
            onStop: record => stops.push(record),
          })
          started.resolve(process)
          void process.handle.result.then(outcome => {
            if (terminal.state !== running) return
            terminal.state =
              outcome.kind === 'completed'
                ? { kind: 'idle' }
                : { kind: 'invalid', execution: Promise.resolve(process) }
            if (outcome.kind === 'completed' && answer.observedCwd !== undefined)
              terminal.observedCwd = answer.observedCwd
          })
          return { kind: 'done', requestId: request.requestId, value: process.handle }
        }
        default: {
          const exhaustive: never = answer
          return exhaustive
        }
      }
    } catch (error) {
      terminal.state = { kind: 'invalid', execution: null }
      started.resolve(null)
      throw error
    }
  }

  const facility: TerminalFacility<P> = {
    async create(request) {
      if (closed) return reject(request.requestId, 'closed')
      if (request.retain !== undefined) return reject(request.requestId, 'unsupported')
      const ref = { id: `${namespace}-terminal-${terminals.size + 1}`, generation: '1' }
      terminals.set(ref.id, {
        ref: { ...ref },
        observedCwd: request.cwd,
        env: { ...request.env },
        state: { kind: 'idle' },
      })
      return { kind: 'done', requestId: request.requestId, value: { terminal: ref } }
    },
    execute,
    async close(request) {
      if (closed) return reject(request.requestId, 'closed')
      const terminal = find(request.terminal)
      if (!terminal) return reject(request.requestId, 'invalidInput')
      const state = terminal.state
      let status: 'confirmed' | 'unconfirmed' = 'confirmed'
      if (state.kind === 'running' || state.kind === 'invalid') {
        terminal.state = { kind: 'invalid', execution: state.execution }
        const process = await state.execution
        status = process
          ? process.settled
            ? 'confirmed'
            : await process.handle.stop('forced')
          : 'unconfirmed'
      }
      if (status === 'confirmed') terminal.state = { kind: 'closed' }
      else if (state.kind === 'running' || state.kind === 'invalid')
        terminal.state = { kind: 'invalid', execution: state.execution }
      return { kind: 'done', requestId: request.requestId, value: { status } }
    },
    async list(request) {
      if (closed) return reject(request.requestId, 'closed')
      return {
        kind: 'done',
        requestId: request.requestId,
        value: [...terminals.values()].map(terminal => ({
          terminal: { ...terminal.ref },
          state: terminal.state.kind,
          observedCwd: terminal.observedCwd,
        })),
      }
    },
  }
  return {
    durability: 'none',
    facility,
    calls,
    stops,
    close() {
      closed = true
    },
    invalidate(ref) {
      const terminal = required(ref)
      if (terminal.state.kind === 'closed') return
      terminal.state = {
        kind: 'invalid',
        execution:
          terminal.state.kind === 'running' || terminal.state.kind === 'invalid'
            ? terminal.state.execution
            : null,
      }
    },
    async finish(ref) {
      const terminal = required(ref)
      if (terminal.state.kind !== 'running' && terminal.state.kind !== 'invalid')
        throw new TypeError('scripted terminal: no active execution')
      const process = await terminal.state.execution
      if (!process) throw new TypeError('scripted terminal: execution was not confirmed')
      process.complete()
      await process.handle.result
    },
  }
}
