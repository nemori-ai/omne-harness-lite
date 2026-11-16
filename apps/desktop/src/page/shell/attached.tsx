import type { ReactNode } from 'react'
import type { AttachedItem, AttachedLayout, ShellSlots } from '@omne-harness/shell-contract'
import { useSlot, useWatched } from './hooks.ts'
import { Item } from './item.tsx'
import type { Watched } from './state.ts'

export type AttachedProps = Readonly<{
  slots: ShellSlots
  scope: Watched<string | undefined>
  anchor: string
  subject: string
}>

type Anchored = Readonly<{ item: AttachedItem; node: ReactNode }>

function useAnchored(props: AttachedProps): readonly Anchored[] {
  const items = useSlot(props.slots, 'attached').filter(item => item.anchor === props.anchor)
  const scope = useWatched(props.scope)
  const { subject } = props
  return items.map(item => ({
    item,
    node: (
      <Item
        key={item.id}
        scope={scope}
        subject={subject}
        render={() => item.render({ scope, subject })}
      />
    ),
  }))
}

export function Attached(props: AttachedProps) {
  const anchored = useAnchored(props)
  return <>{anchored.map(entry => entry.node)}</>
}

export type ArrangedProps = AttachedProps & Readonly<{ layout: AttachedLayout }>

export function Arranged(props: ArrangedProps) {
  const anchored = useAnchored(props)
  return (
    <>
      {props.layout(anchored.map(({ item, node }) => ({ id: item.id, label: item.label, node })))}
    </>
  )
}
