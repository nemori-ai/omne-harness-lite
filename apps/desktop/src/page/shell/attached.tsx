import { Fragment } from 'react'
import type { AttachedLayout, ShellSlots } from '@omne-harness/shell-contract'
import { useSlot, useWatched } from './hooks.ts'
import type { Watched } from './state.ts'

export type AttachedProps = Readonly<{
  slots: ShellSlots
  scope: Watched<string | undefined>
  anchor: string
  subject: string
}>

export function Attached(props: AttachedProps) {
  const items = useSlot(props.slots, 'attached').filter(item => item.anchor === props.anchor)
  const scope = useWatched(props.scope)
  if (items.length === 0) return null
  return (
    <>
      {items.map(item => (
        <Fragment key={item.id}>{item.render({ scope, subject: props.subject })}</Fragment>
      ))}
    </>
  )
}

export type ArrangedProps = AttachedProps & Readonly<{ layout: AttachedLayout }>

export function Arranged(props: ArrangedProps) {
  const items = useSlot(props.slots, 'attached').filter(item => item.anchor === props.anchor)
  const scope = useWatched(props.scope)
  return (
    <>
      {props.layout(
        items.map(item => ({
          id: item.id,
          label: item.label,
          node: item.render({ scope, subject: props.subject }),
        })),
      )}
    </>
  )
}
