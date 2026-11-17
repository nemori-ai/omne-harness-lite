import { Component, type ReactNode } from 'react'
import { InlineNotice } from '@omne-harness/ui-kit'

export const ITEM_FAILED_TEXT = '这一块读不出'

type BoundaryProps = Readonly<{ resetKey: string; fallback: ReactNode; children: ReactNode }>

type BoundaryState = Readonly<{ failed: boolean; resetKey: string }>

class ItemBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props)
    this.state = { failed: false, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(): Partial<BoundaryState> {
    return { failed: true }
  }

  static getDerivedStateFromProps(
    props: BoundaryProps,
    state: BoundaryState,
  ): BoundaryState | null {
    return props.resetKey === state.resetKey ? null : { failed: false, resetKey: props.resetKey }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function Rendered(props: { render: () => ReactNode }): ReactNode {
  return props.render()
}

const failedNotice = (
  <InlineNotice tone="caution" role="status" className="shell-item-failed" still>
    {ITEM_FAILED_TEXT}
  </InlineNotice>
)

export type ItemProps = Readonly<{
  scope?: string | undefined
  subject?: string
  quiet?: boolean
  render: () => ReactNode
}>

export function Item(props: ItemProps) {
  return (
    <ItemBoundary
      resetKey={JSON.stringify([props.scope, props.subject])}
      fallback={props.quiet === true ? null : failedNotice}
    >
      <Rendered render={props.render} />
    </ItemBoundary>
  )
}
