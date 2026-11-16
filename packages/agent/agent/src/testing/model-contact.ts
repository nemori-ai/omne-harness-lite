import type { CallContact, ModelRuntime } from '@omne-harness/model-contract'
import { succeed } from '@omne-harness/operation-result'
import { scriptedMethod, type In, type Out, type ScriptOf } from './script.ts'

type Contact<P> = ModelRuntime<P>['calls']['contact']

export type ScriptedModelContact<P> = Readonly<{
  runtime: ModelRuntime<P>
  contact: ScriptOf<Contact<P>>
}>

export function scriptModelContact<P>(runtime: ModelRuntime<P>): ScriptedModelContact<P> {
  const contact = scriptedMethod<In<Contact<P>>, Out<Contact<P>>>(async input => {
    const found = await runtime.calls.inspect(input)
    if ('failure' in found) return found
    if (found.ok.kind === 'not-accepted') return succeed<CallContact>({ kind: 'not-accepted' })
    const settled = found.ok.state.phase === 'settled'
    return succeed<CallContact>({ kind: settled ? 'settled' : 'holding' })
  })
  return {
    runtime: { ...runtime, calls: { ...runtime.calls, contact: contact.call } },
    contact: contact.script,
  }
}
