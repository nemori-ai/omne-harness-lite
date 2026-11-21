import {
  Button,
  DisclosureIcon,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@omne-harness/ui-kit'
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ModelChoice, ModelSelectionStore } from '../model/model-selection.ts'

const DEFAULT = '::default'
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

function useChoices(store: ModelSelectionStore, tenant: string) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribeChoices(tenant, listener),
    [store, tenant],
  )
  useEffect(() => {
    void store.loadChoices(tenant)
  }, [store, tenant])
  return useSyncExternalStore(subscribe, () => store.choices(tenant))
}

// The model a session has stays in the list even when nobody offers it any more.
const withCurrent = (choices: readonly ModelChoice[], model: string): readonly ModelChoice[] =>
  choices.some(choice => choice.route === model)
    ? choices
    : [{ route: model, selectable: false, note: '不在现在的列表里' }, ...choices]

type Props = Readonly<{ store: ModelSelectionStore; tenant: string; session: string }>

export function ModelAction({ store, tenant, session }: Props) {
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant, session))
  const listing = useChoices(store, tenant)
  const [said, say] = useState<string | null>(null)
  useEffect(() => {
    say(null)
    void store.load(tenant, session)
  }, [store, tenant, session])
  if (view.kind === 'unread') return null
  if (view.kind === 'unreadable')
    return (
      <span className="omne-session-model" role="status">
        模型读不到：{view.reason}
      </span>
    )
  return (
    <span className="omne-session-model">
      {listing.kind === 'listed' ? (
        <ModelSelect
          label="模型"
          value={view.model}
          shown={view.model}
          choices={withCurrent(listing.choices, view.model)}
          onValueChange={model => void store.select(tenant, session, model).then(say)}
        />
      ) : (
        <span>模型：{view.model}</span>
      )}
      {said === null ? null : <span role="status">{said}</span>}
    </span>
  )
}

/** The model the next new session starts with: none named until a person picks one on offer. */
export function useNewSessionModel(
  store: ModelSelectionStore,
  tenant: string,
): Readonly<{ model: string | undefined; picker: ReactNode }> {
  const listing = useChoices(store, tenant)
  const [picked, pick] = useState<string | null>(null)
  if (listing.kind !== 'listed' || listing.choices.length === 0)
    return { model: undefined, picker: null }
  const offered = listing.choices.some(choice => choice.route === picked && choice.selectable)
  const model = offered && picked !== null ? picked : undefined
  const shown = model ?? '默认模型'
  // A quiet dropdown beside 新建会话: its face is the value, so it never takes a line of its own.
  const picker = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="compact"
          className="omne-sessions-model"
          aria-label={`新会话的模型：${shown}`}
        >
          <span className="omne-sessions-model-value">{shown}</span>
          <DisclosureIcon aria-hidden="true" className="rotate-90" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={model ?? DEFAULT}
          onValueChange={value => pick(value === DEFAULT ? null : value)}
        >
          <DropdownMenuRadioItem value={DEFAULT}>默认模型</DropdownMenuRadioItem>
          {listing.choices.map(choice => (
            <DropdownMenuRadioItem
              key={choice.route}
              value={choice.route}
              disabled={!choice.selectable}
            >
              {choice.route}
              {choice.note === null ? null : (
                <span className="omne-sessions-model-note">（{choice.note}）</span>
              )}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return { model, picker }
}
