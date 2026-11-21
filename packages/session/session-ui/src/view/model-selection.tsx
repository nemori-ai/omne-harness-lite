import {
  DropdownMenuItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@omne-harness/ui-kit'
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ModelChoice, ModelSelectionStore } from '../model/model-selection.ts'
import { FOLD_RANK, FoldedChoice, HeadingChoice, useHeadingPlace } from './heading-fold.tsx'

const OPTION = 'omne-session-model-option'

function ModelSelect({
  label,
  value,
  shown,
  choices,
  lead,
  onValueChange,
}: {
  readonly label: string
  readonly value: string
  readonly shown: string
  readonly choices: readonly ModelChoice[]
  readonly lead?: ReactNode
  readonly onValueChange: (value: string) => void
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label={label} size="sm">
        <SelectValue>{shown}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {lead}
        {choices.map(choice => (
          <SelectItem
            key={choice.route}
            className={OPTION}
            value={choice.route}
            disabled={!choice.selectable}
          >
            {choice.route}
            {choice.note === null ? null : (
              <span className="omne-session-model-note">（{choice.note}）</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function useChoices(store: ModelSelectionStore, tenant: string, load = true) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeChoices(tenant, listener),
    [store, tenant],
  )
  useEffect(() => {
    if (load) void store.loadChoices(tenant)
  }, [store, tenant, load])
  return useSyncExternalStore(subscribe, () => store.choices(tenant))
}

// The model a session has stays in the list even when nobody offers it any more.
const withCurrent = (choices: readonly ModelChoice[], model: string): readonly ModelChoice[] =>
  choices.some(choice => choice.route === model)
    ? choices
    : [{ route: model, selectable: false, note: '不在现在的列表里' }, ...choices]

type Props = Readonly<{ store: ModelSelectionStore; tenant: string; session: string }>

export function ModelAction({ store, tenant, session }: Props) {
  const inBar = useHeadingPlace() === 'bar'
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant, session))
  const listing = useChoices(store, tenant, inBar)
  const [said, say] = useState<string | null>(null)
  useEffect(() => {
    if (!inBar) return
    say(null)
    void store.load(tenant, session)
  }, [store, tenant, session, inBar])
  if (view.kind === 'unread') return null
  if (view.kind === 'unreadable') {
    const reason = `模型读不到：${view.reason}`
    return (
      <HeadingChoice
        rank={FOLD_RANK.model}
        bar={
          <span className="omne-session-model" role="status">
            {reason}
          </span>
        }
        menu={() => <DropdownMenuItem disabled>{reason}</DropdownMenuItem>}
      />
    )
  }
  const choices = listing.kind === 'listed' ? withCurrent(listing.choices, view.model) : null
  const select = (model: string, tell: (text: string) => void) =>
    void store.select(tenant, session, model).then(tell)
  return (
    <HeadingChoice
      rank={FOLD_RANK.model}
      bar={
        <span className="omne-session-model">
          {choices === null ? (
            <span>模型：{view.model}</span>
          ) : (
            <ModelSelect
              label="模型"
              value={view.model}
              shown={view.model}
              choices={choices}
              onValueChange={model => select(model, say)}
            />
          )}
          {said === null ? null : <span role="status">{said}</span>}
        </span>
      }
      menu={tell => (
        <FoldedChoice
          label="模型"
          value={view.model}
          shown={view.model}
          options={
            choices === null
              ? null
              : choices.map(choice => ({
                  value: choice.route,
                  label: choice.route,
                  note: choice.note,
                  disabled: !choice.selectable,
                }))
          }
          onPick={model => select(model, tell)}
        />
      )}
    />
  )
}
