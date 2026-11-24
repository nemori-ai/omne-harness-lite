import { inputSourceName, type InputSourceDeclaration } from '@omne-harness/session-contract'

/** The source of what a member sends through the entry: the member in person, always waking. */
export const MEMBER_INPUT_SOURCE: InputSourceDeclaration = Object.freeze({
  name: inputSourceName('session.member'),
  label: 'Member',
  accepts: Object.freeze({ subject: 'member' }),
  wake: 'always',
})
