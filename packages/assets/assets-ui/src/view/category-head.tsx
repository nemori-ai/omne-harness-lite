import { Button } from '@omne-harness/ui-kit'
import { useState, useSyncExternalStore, type JSX, type ReactNode } from 'react'
import type { CategoryGovernance } from '../model/governance.ts'
import { assetsCategoryCreate, assetsCategoryHead } from '../parts.ts'
import { CreateForm } from './create-form.tsx'

/** The form under 新建: the one the category gives, else the generic form it is handed. */
export type CreateFormSlot = (category: string, generic: ReactNode) => ReactNode

type HeadProps = Readonly<{
  view: CategoryGovernance
  category: string
  label: string
  createForm: CreateFormSlot
}>

/** The head of every pane of a category, its own page or the generic one: its name, and 新建 when it can be made here. */
export function CategoryHead({ view, category, label, createForm }: HeadProps): JSX.Element {
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot)
  const [creating, setCreating] = useState(false)
  const creation =
    snapshot.kind === 'read' && snapshot.creation?.kind !== 'none' ? snapshot.creation : null
  const entries =
    snapshot.kind === 'read' && snapshot.assets.kind === 'read' ? snapshot.assets.entries : null
  const listed = (name: string) => entries?.some(each => each.row.name === name) ?? false
  return (
    <>
      <header className="assets-category-head" {...assetsCategoryHead.props}>
        <h2 className="assets-category-title">{label}</h2>
        {creation !== null && (
          <Button
            variant={creating ? 'ghost' : 'outline'}
            aria-expanded={creating}
            {...assetsCategoryCreate.props}
            onClick={() => setCreating(open => !open)}
          >
            {creating ? '收起' : '新建'}
          </Button>
        )}
      </header>
      {creating &&
        creation !== null &&
        snapshot.kind === 'read' &&
        createForm(
          category,
          <CreateForm
            view={view}
            creation={creation}
            hint={snapshot.hint}
            creating={snapshot.creating}
            listed={listed}
          />,
        )}
    </>
  )
}
