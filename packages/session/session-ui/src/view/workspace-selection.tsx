import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@omne-harness/ui-kit'
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useOffered } from './use-offered.ts'
import {
  reasonText,
  sameTarget,
  type WorkspaceChoice,
  type WorkspaceSelectionStore,
  type WorkspaceSelectionView,
  type WorkspaceTarget,
} from '../model/workspace-selection.ts'

const NONE = '::none'
const OPTION = 'omne-session-workspace-option'
const valueOf = (target: WorkspaceTarget | null): string =>
  target === null ? NONE : JSON.stringify([target.workspace, target.instance])

function WorkspaceSelect({
  label,
  value,
  shown,
  choices,
  onValueChange,
}: {
  readonly label: string
  readonly value: WorkspaceTarget | null
  readonly shown: string
  readonly choices: readonly WorkspaceChoice[]
  readonly onValueChange: (value: WorkspaceTarget | null) => void
}) {
  return (
    <Select
      value={valueOf(value)}
      onValueChange={picked => {
        const choice = choices.find(offered => valueOf(offered) === picked)
        onValueChange(
          choice === undefined ? null : { workspace: choice.workspace, instance: choice.instance },
        )
      }}
    >
      <SelectTrigger aria-label={label} size="sm">
        <SelectValue>{shown}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem className={OPTION} value={NONE}>
          不选工作区
        </SelectItem>
        {choices.map(choice => (
          <SelectItem
            key={valueOf(choice)}
            className={OPTION}
            value={valueOf(choice)}
            disabled={!choice.selectable}
          >
            {choice.label}
            {choice.note === null ? null : (
              <span className="omne-session-workspace-note">（{choice.note}）</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

type Read = Extract<WorkspaceSelectionView, { kind: 'read' }>

// The instance a session stands at stays in the list even when nobody offers it any more.
function withCurrent(choices: readonly WorkspaceChoice[], view: Read): readonly WorkspaceChoice[] {
  const at = view.workspace
  if (at === null || choices.some(choice => sameTarget(choice, at))) return choices
  const label = view.directory ?? at.instance
  return [{ ...at, label, selectable: false, note: '不在现在的列表里' }, ...choices]
}

const placeText = (view: Read): string =>
  view.state === 'unusable'
    ? `工作区用不了：${reasonText(view.reason ?? '')}`
    : `工作目录：${view.directory ?? ''}`

type Props = Readonly<{ store: WorkspaceSelectionStore; tenant: string; session: string }>

export function WorkspaceAction({ store, tenant, session }: Props) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant, session))
  const listing = useOffered(store, tenant)
  const [said, say] = useState<string | null>(null)
  useEffect(() => {
    say(null)
    void store.load(tenant, session)
  }, [store, tenant, session])
  const told = said === null ? null : <span role="status">{said}</span>
  if (view.kind === 'unread') return null
  if (view.kind === 'unreadable')
    return (
      <span className="omne-session-workspace">
        <span role="status">工作目录读不到：{view.reason}</span>
        {told}
      </span>
    )
  const choices = listing.kind === 'listed' ? withCurrent(listing.choices, view) : null
  const current = choices?.find(choice => sameTarget(choice, view.workspace))
  return (
    <span className="omne-session-workspace">
      {choices === null ? null : (
        <WorkspaceSelect
          label="工作区"
          value={view.workspace}
          shown={current?.label ?? '不选工作区'}
          choices={choices}
          onValueChange={target => void store.select(tenant, session, target).then(say)}
        />
      )}
      <span>{placeText(view)}</span>
      {told}
    </span>
  )
}

/** The instance the next new session starts in: none until a person picks one on offer. */
export function useNewSessionWorkspace(
  store: WorkspaceSelectionStore,
  tenant: string,
): Readonly<{ workspace: WorkspaceTarget | undefined; picker: ReactNode }> {
  const listing = useOffered(store, tenant)
  const [picked, pick] = useState<WorkspaceTarget | null>(null)
  if (listing.kind !== 'listed' || listing.choices.length === 0)
    return { workspace: undefined, picker: null }
  const offered = listing.choices.find(choice => choice.selectable && sameTarget(choice, picked))
  const workspace =
    offered === undefined ? undefined : { workspace: offered.workspace, instance: offered.instance }
  const picker = (
    <WorkspaceSelect
      label="新会话的工作区"
      value={workspace ?? null}
      shown={offered?.label ?? '不选工作区'}
      choices={listing.choices}
      onValueChange={pick}
    />
  )
  return { workspace, picker }
}
