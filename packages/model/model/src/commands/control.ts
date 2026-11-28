// The consumer's hold on a call it admitted: reading it as its controller, and asking it to stop.
import type { ModelCommands } from '@omne-harness/model-contract/provider'
import { authFailure, missingReceipt, requestedControl } from './judge.ts'
import { bump, type ModelCommandCore } from './state.ts'
import { invalid } from './value.ts'

export function controlCommands<P>(
  core: ModelCommandCore<P>,
): Pick<ModelCommands<P>, 'loadControl' | 'control'> {
  return {
    loadControl: input =>
      core.runRead(input, () =>
        core.read(input, 'control', call => ({
          ok: { state: structuredClone(call.state), request: structuredClone(call.request) },
        })),
      ),
    control: input =>
      core.runWrite(input, () =>
        core.write({
          input,
          method: 'control',
          fields: { call: input.call, intent: input.intent },
          check: call => authFailure(core.authorize(input, 'control', call, input.call)),
          apply: draft => {
            const call = draft.call
            if (!call) return { failure: invalid('call', 'not-found') }
            const requested = requestedControl(input)
            if (requested === null) return { failure: invalid('intent', 'unknown') }
            if (call.state.control.kind === 'none') {
              call.state = { ...call.state, control: requested }
              bump(call)
            }
            return {
              ok: { value: structuredClone(call.state.control), receipt: { kind: 'control' } },
            }
          },
          replay: call => (call ? { ok: structuredClone(call.state.control) } : missingReceipt()),
        }),
      ),
  }
}
