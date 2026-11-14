import type { CallContact } from '../index.ts'
import {
  acknowledged,
  callId,
  contactOf,
  ended,
  expect,
  operationId,
  placed,
  same,
  show,
  stateOf,
} from './conformance-kit.ts'
import type { Check } from './conformance-types.ts'

type Answer = CallContact['kind']

const OPEN: readonly Answer[] = ['holding', 'lost', 'unknown']
const WAITING: readonly Answer[] = ['settled', 'lost', 'unknown']

export function contactChecks<P>(): readonly Check<P>[] {
  return [
    {
      name: 'contact-without-call-is-not-accepted',
      requires: [],
      async run(scene) {
        const contact = await contactOf(scene, {
          call: callId('contact-absent'),
          operation: operationId('contact-absent'),
        })
        expect(
          contact.kind === 'not-accepted',
          `the contact of a call that was never admitted gives ${show(contact)}`,
        )
      },
    },
    {
      name: 'contact-on-open-call-claims-no-end',
      requires: [],
      async run(scene) {
        const contact = await contactOf(scene, await placed(scene, 'contact-open'))
        expect(
          OPEN.includes(contact.kind),
          `the contact of a call that has not settled gives ${show(contact)}`,
        )
      },
    },
    {
      name: 'contact-on-unacknowledged-result-claims-no-run',
      requires: ['startRun', 'settleCall'],
      async run(scene) {
        const contact = await contactOf(scene, await ended(scene, 'contact-waiting'))
        expect(
          WAITING.includes(contact.kind),
          `the contact of a result that is not acknowledged gives ${show(contact)}`,
        )
      },
    },
    {
      name: 'contact-on-acknowledged-result-is-settled',
      requires: ['startRun', 'settleCall', 'provideEvidence'],
      async run(scene) {
        const call = await ended(scene, 'contact-taken')
        await acknowledged(scene, call)
        const contact = await contactOf(scene, call)
        expect(
          contact.kind === 'settled',
          `the contact of an acknowledged result gives ${show(contact)}`,
        )
      },
    },
    {
      name: 'contact-changes-nothing',
      requires: [],
      async run(scene) {
        const call = await placed(scene, 'contact-reads')
        const before = await stateOf(scene, call)
        await contactOf(scene, call)
        const after = await stateOf(scene, call)
        expect(same(before, after), `the contact changed the call: ${show(after)}`)
      },
    },
  ]
}
