import {
  BackIcon,
  IconButton,
  InlineNotice,
  ReadingDocument,
  ReadingToolbar,
} from '@omne-harness/ui-kit'
import { useEffect, useRef, type JSX, type KeyboardEvent } from 'react'
import type { AssetEntry } from '../model/governance.ts'
import { assetsAsset, assetsAssetToolbar } from '../parts.ts'

/** What brought a row, read from `<category>:<name>`, with the title of that category. */
export type Bringer = Readonly<{ category: string; title: string; name: string }>

export function bringerOf(from: string, label: (category: string) => string): Bringer {
  const colon = from.indexOf(':')
  const category = colon < 0 ? from : from.slice(0, colon)
  return { category, title: label(category), name: colon < 0 ? '' : from.slice(colon + 1) }
}

type BroughtPageProps = Readonly<{
  entry: AssetEntry
  from: Bringer
  label: string
  open: (category: string, name: string) => void
  onBack: () => void
}>

/** One that another asset brought: only seen here; enabling, disabling, removing and its settings are in that one. */
export function BroughtPage({ entry, from, label, open, onBack }: BroughtPageProps): JSX.Element {
  const { row } = entry
  const title = row.summary?.title ?? row.name
  const bringer = `${from.title}「${from.name}」`
  const back = useRef<HTMLButtonElement>(null)
  useEffect(() => back.current?.focus(), [])
  const leave = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented) return
    event.preventDefault()
    onBack()
  }
  return (
    <section className="assets-asset" aria-label={title} onKeyDown={leave} {...assetsAsset.props}>
      <div {...assetsAssetToolbar.props}>
        <ReadingToolbar
          name={
            <>
              {label}
              <span aria-hidden="true"> › </span>
              {title}
            </>
          }
          back={
            <IconButton ref={back} label="回到列表" onClick={onBack}>
              <BackIcon aria-hidden="true" />
            </IconButton>
          }
          origin={`来自 ${bringer}`}
        />
      </div>
      <ReadingDocument>
        <h2 className="assets-asset-title">{title}</h2>
        <InlineNotice
          tone="info"
          action={{ label: `去 ${bringer}`, onClick: () => open(from.category, from.name) }}
        >
          <p>这一份是 {bringer} 带来的，在这里只能看。启用、禁用、移除与设置都在那一份里。</p>
        </InlineNotice>
      </ReadingDocument>
    </section>
  )
}
