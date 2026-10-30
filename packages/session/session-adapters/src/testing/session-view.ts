import type { Access, AgentReceivedProvider, Failure } from '@omne-harness/agent-contract'
import { tenantCodec } from '@omne-harness/legal-identity'
import { fail, type Outcome } from '@omne-harness/operation-result'
import type { ContentBlock } from '@omne-harness/content-block'

/** Routes the tenant supplied on each public call to that tenant's root in one explicit Session. */
type CompleteProvider<P> = AgentReceivedProvider<P, ContentBlock> & {
  received: NonNullable<AgentReceivedProvider<P, ContentBlock>['received']>
}
export function sessionView<P>(
  select: (input: Access<P>) => CompleteProvider<P>,
): CompleteProvider<P> {
  const invoke = <T>(
    input: Access<P>,
    action: string,
    read: (view: CompleteProvider<P>) => Promise<Outcome<T, Failure>>,
  ): Promise<Outcome<T, Failure>> =>
    tenantCodec.encode(input.tenant).ok
      ? read(select(input))
      : Promise.resolve(
          fail(
            action.startsWith('received.')
              ? {
                  kind: 'invalid',
                  field: 'tenant',
                  reason: 'not a tenant minted by legal-identity',
                }
              : { kind: 'denied', action },
          ),
        )
  return {
    journal: {
      capabilities: {
        coordination: 'coordinated',
        participants: new Set(['message', 'context-transition', 'custody', 'processed']),
      },
      open: input => invoke(input, 'journal.open', view => view.journal.open(input)),
      attach: input => invoke(input, 'journal.attach', view => view.journal.attach(input)),
      detach: input => invoke(input, 'journal.detach', view => view.journal.detach(input)),
      commit: input => invoke(input, 'journal.commit', view => view.journal.commit(input)),
      submit: input => invoke(input, 'journal.submit', view => view.journal.submit(input)),
      control: input => invoke(input, 'journal.control', view => view.journal.control(input)),
      acknowledge: input =>
        invoke(input, 'journal.acknowledge', view => view.journal.acknowledge(input)),
      recordResult: input =>
        invoke(input, 'journal.recordResult', view => view.journal.recordResult(input)),
      recordControl: input =>
        invoke(input, 'journal.recordControl', view => view.journal.recordControl(input)),
      recordHandoff: input =>
        invoke(input, 'journal.recordHandoff', view => view.journal.recordHandoff(input)),
      tryFinish: input => invoke(input, 'journal.tryFinish', view => view.journal.tryFinish(input)),
      recordTerminalObservation: input =>
        invoke(input, 'journal.recordTerminalObservation', view =>
          view.journal.recordTerminalObservation(input),
        ),
      load: input => invoke(input, 'journal.load', view => view.journal.load(input)),
      inputs: input => invoke(input, 'journal.inputs', view => view.journal.inputs(input)),
      readReplyAdmissions: input =>
        invoke(input, 'journal.readReplyAdmissions', view =>
          view.journal.readReplyAdmissions(input),
        ),
      query: input => invoke(input, 'journal.query', view => view.journal.query(input)),
      output: {
        read: input =>
          invoke(input, 'journal.output.read', view => view.journal.output.read(input)),
        async *events(input) {
          if (!tenantCodec.encode(input.tenant).ok) {
            yield fail<Failure>({ kind: 'denied', action: 'output.events' })
            return
          }
          yield* select(input).journal.output.events(input)
        },
      },
    },
    entries: {
      record: input => invoke(input, 'entries.record', view => view.entries.record(input)),
    },
    materials: {
      preserve: input =>
        invoke(input, 'materials.preserve', view => view.materials.preserve(input)),
      read: input => invoke(input, 'materials.read', view => view.materials.read(input)),
    },
    received: {
      commit: input => invoke(input, 'received.commit', view => view.received.commit(input)),
      query: input => invoke(input, 'received.query', view => view.received.query(input)),
    },
  }
}
