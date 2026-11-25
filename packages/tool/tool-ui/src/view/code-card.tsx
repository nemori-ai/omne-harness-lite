import { CodeSurface, Disclosure } from '@omne-harness/ui-kit'
import type { ReactNode } from 'react'
import { toolCodeCard } from '../parts.ts'
import type { CallChildrenStore } from '../model/call-children.ts'
import { CallChildren } from './call-children.tsx'

/** One call of a tool as the conversation hands it to a drawing; `call` is null before it has a reference. */
export type ToolCallSubject = Readonly<{
  session: string
  call: string | null
  name: string
  arguments: unknown
  state: string
  result: string | null
}>

/** The program text of a call of Code, when it was given as text and its arguments are read. */
export function programOf(given: unknown): string | null {
  if (typeof given !== 'object' || given === null) return null
  const code = (given as Readonly<Record<string, unknown>>)['code']
  return typeof code === 'string' && code !== '' ? code : null
}

const REFERENCE = /^\["tool-invocation",/u

/** The conversation's own row of the call, then the program as code, then the calls it made. */
export function CodeCard({
  store,
  tenant,
  subject,
  generic,
}: {
  readonly store: CallChildrenStore
  readonly tenant: string
  readonly subject: ToolCallSubject
  readonly generic: () => ReactNode
}) {
  const program = programOf(subject.arguments)
  const reference = subject.call !== null && REFERENCE.test(subject.call) ? subject.call : null
  return (
    <div className="flex flex-col gap-1" {...toolCodeCard.props}>
      {generic()}
      {program === null ? null : (
        <Disclosure label="程序">
          <CodeSurface name="TypeScript" text={program} />
        </Disclosure>
      )}
      {reference === null ? null : (
        <CallChildren store={store} tenant={tenant} reference={reference} />
      )}
    </div>
  )
}
