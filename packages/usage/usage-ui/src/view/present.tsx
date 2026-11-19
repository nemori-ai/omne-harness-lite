import type { PointHost } from '@omne-harness/shell-contract'
import { createContext, useContext, useEffect } from 'react'
import { pick, type Shape } from '../model/layout.ts'
import type { ShapeData } from '../model/shapes.ts'
import { usagePresentation, type WidgetSubject } from '../points.ts'
import type { UsageReads } from './reads.ts'

export type PanelValue = Readonly<{
  shell: PointHost
  reads: UsageReads
  tenant: string
  subject: WidgetSubject
}>
export const PanelContext = createContext<PanelValue | null>(null)

export type ItemValue = Readonly<{ presentation: string | null; report: (shape: Shape) => void }>
export const ItemContext = createContext<ItemValue>({ presentation: null, report: () => undefined })

export function usePanel(): PanelValue {
  const panel = useContext(PanelContext)
  if (panel === null) throw new Error('usage-ui: a widget is drawn outside a usage panel')
  return panel
}

/** A widget's data drawn by the presentation the layout chose for it, else by the one it declares. */
export function Present<K extends Shape>({
  shape,
  fallback,
  label,
  data,
}: {
  readonly shape: K
  readonly fallback: string
  readonly label: string
  readonly data: ShapeData[K]
}): React.JSX.Element {
  const { shell } = usePanel()
  const item = useContext(ItemContext)
  useEffect(() => item.report(shape), [item, shape])
  return (
    <>
      {usagePresentation.slot(shell, shape, { ...data, label }, entries => {
        const picked = pick(item.presentation, fallback, new Set(entries.map(entry => entry.id)))
        if (picked.kind === 'undrawable')
          return <p className="usage-card-note">这张卡片现在画不出来：没有能画它的画法。</p>
        const node = entries.find(entry => entry.id === picked.presentation)?.node
        return (
          <>
            {picked.kind === 'fallback' && (
              <p className="usage-card-note">所选的画法不在了，用的是这张卡片的缺省画法。</p>
            )}
            {node}
          </>
        )
      })}
    </>
  )
}
