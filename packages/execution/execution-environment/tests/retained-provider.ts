import type {
  FacilityResult,
  ProviderAcquireInput,
  TerminalFacility,
  TerminalRef,
} from '@omne-harness/execution-environment-contract'
import { createScriptedTerminalFacility } from '@omne-harness/execution-environment-contract/testing'
import { scriptedProvider } from './doubles.ts'

/** Frozen protocol peer for registry wiring tests. It has no shell, durable ledger or Session authority. */
export function retainedPeer() {
  const terminal = createScriptedTerminalFacility(request => ({
    kind: 'started',
    observedCwd: request.script,
  }))
  const retained = new Map<string, { ref: TerminalRef; scope: string }>()
  const inputs: ProviderAcquireInput[] = []
  const calls: string[] = []
  const provider = scriptedProvider({
    keys: ['terminal'],
    acquire: async input => {
      inputs.push(input)
      const attachments = new Set<string>()
      const detached = new Set<string>()
      const refuse = (
        requestId: string,
        reason: 'unsupported' | 'notFound' | 'closed',
      ): FacilityResult<never> => ({ kind: 'rejected', requestId, reason })
      const facility: TerminalFacility<unknown> = {
        async create(request) {
          if (request.retain !== 'session' || input.retention === undefined)
            return refuse(request.requestId, 'unsupported')
          const { retain: _retain, ...ordinary } = request
          const created = await terminal.facility.create(ordinary)
          if (created.kind === 'done') {
            const ref = created.value.terminal
            retained.set(ref.id, { ref, scope: input.retention.scope.ref })
            attachments.add(ref.id)
          }
          return created
        },
        retention: {
          async attach(request) {
            calls.push('attach')
            const entry = retained.get(request.terminal.id)
            if (input.retention === undefined) return refuse(request.requestId, 'unsupported')
            if (input.retention.released.aborted) return refuse(request.requestId, 'closed')
            if (
              entry?.scope !== input.retention.scope.ref ||
              entry.ref.generation !== request.terminal.generation
            )
              return refuse(request.requestId, 'notFound')
            if (detached.has(entry.ref.id)) return refuse(request.requestId, 'closed')
            attachments.add(entry.ref.id)
            return { kind: 'done', requestId: request.requestId, value: { terminal: entry.ref } }
          },
          async detach(request) {
            calls.push('detach')
            attachments.delete(request.terminal.id)
            detached.add(request.terminal.id)
            return { kind: 'done', requestId: request.requestId, value: { status: 'confirmed' } }
          },
        },
        async execute(request) {
          calls.push('execute')
          if (!attachments.has(request.terminal.id)) return refuse(request.requestId, 'notFound')
          return terminal.facility.execute(request)
        },
        close: request => terminal.facility.close(request),
        async list(request) {
          const listed = await terminal.facility.list(request)
          return listed.kind === 'done'
            ? { ...listed, value: listed.value.filter(item => attachments.has(item.terminal.id)) }
            : listed
        },
      }
      return scriptedProvider({
        keys: ['terminal'],
        facilities: { terminal: facility },
        release: async () => {
          for (const id of attachments) detached.add(id)
          attachments.clear()
          return { kind: 'released' }
        },
      }).acquire(input)
    },
  })
  return { provider, inputs, calls }
}
