import {
  DropdownMenuItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@omne-harness/ui-kit'
import { useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useOffered } from './use-offered.ts'
import type { ModelChoice, ModelSelectionStore, ReasoningEffort } from '../model/model-selection.ts'
import {
  FOLD_RANK,
  FoldedChoice,
  HeadingChoice,
  HeadingEntriesContext,
  useHeadingRead,
} from './heading-fold.tsx'
import { sessionHeaderModel } from '../parts.ts'

const EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const satisfies readonly ReasoningEffort[]
const DEFAULT = 'default'
const defaultLabel = (choice: ModelChoice | undefined) =>
  `模型默认（${choice?.defaultReasoningEffort ?? '供应商默认'}）`

type ChoiceProps = Parameters<typeof FoldedChoice>[0]

function InlineChoice({ label, value, shown, options, onPick, onOpen }: ChoiceProps) {
  if (options === null)
    return (
      <span>
        {label}：{shown}
      </span>
    )
  return (
    <Select value={value} onValueChange={onPick} onOpenChange={open => open && onOpen?.()}>
      <SelectTrigger aria-label={label} size="sm">
        <SelectValue>{shown}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <SelectItem
            key={option.value}
            className="omne-session-model-option"
            value={option.value}
            disabled={option.disabled ?? false}
          >
            {option.label}
            {option.note == null ? null : (
              <span className="omne-session-model-note">（{option.note}）</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function routeOption(choice: ModelChoice, previous: ReasoningEffort | undefined) {
  const effort =
    previous !== undefined && choice.reasoningEfforts?.includes(previous) ? previous : undefined
  const usesDefault = choice.selectable && previous !== effort
  const note = usesDefault
    ? [choice.note, `未提供 ${previous}，切换并使用模型默认强度`].filter(Boolean).join('；')
    : choice.note
  return { value: choice.route, label: choice.route, disabled: !choice.selectable, note, effort }
}

// A model that cannot be picked is offered while it is the current one, or while this session's
// content is what stops it, to say why.
function routesOf(
  choices: readonly ModelChoice[],
  model: string,
  previous: ReasoningEffort | undefined,
) {
  const routes = choices
    .filter(choice => choice.selectable || choice.route === model || (choice.blocks ?? 0) > 0)
    .map(choice => routeOption(choice, previous))
  if (!choices.some(choice => choice.route === model))
    routes.unshift({
      value: model,
      label: model,
      disabled: true,
      note: '不在现在的列表里',
      effort: undefined,
    })
  return routes
}

type Props = Readonly<{ store: ModelSelectionStore; tenant: string; session: string }>

export function ModelAction({ store, tenant, session }: Props) {
  const inBar = useHeadingRead(store, tenant, session)
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant, session))
  const where = useMemo(() => ({ tenant, session }), [tenant, session])
  const listing = useOffered(store, where, inBar)
  const entries = useContext(HeadingEntriesContext)
  const [said, say] = useState<string | null>(null)
  useEffect(() => {
    if (inBar) say(null)
  }, [store, tenant, session, inBar])
  if (view.kind === 'unread') return null
  if (view.kind === 'unreadable') {
    const reason = `模型读不到：${view.reason}`
    return (
      <HeadingChoice
        rank={FOLD_RANK.model}
        bar={
          <span className="omne-session-model" {...sessionHeaderModel.props} role="status">
            {reason}
          </span>
        }
        menu={() => <DropdownMenuItem disabled>{reason}</DropdownMenuItem>}
      />
    )
  }
  const choices = listing.kind === 'listed' ? listing.choices : null
  const current = choices?.find(choice => choice.route === view.model)
  const routes = choices === null ? null : routesOf(choices, view.model, view.reasoningEffort)
  const modelChoice = (tell: (text: string) => void): ChoiceProps => ({
    label: '模型',
    value: view.model,
    shown: view.model,
    options: routes,
    // What the session holds changes as it goes: the list is read again whenever it is opened.
    onOpen: () => void store.loadChoices(where),
    onPick(model) {
      const selected = routes?.find(option => option.value === model)
      if (selected !== undefined && !selected.disabled)
        void store.select(tenant, session, model, selected.effort, entries).then(tell)
    },
  })
  const effortChoice = (tell: (text: string) => void): ChoiceProps => ({
    label: '推理强度',
    value: view.reasoningEffort ?? DEFAULT,
    shown: view.reasoningEffort ?? defaultLabel(current),
    options:
      choices === null
        ? null
        : [
            { value: DEFAULT, label: defaultLabel(current), disabled: !current?.selectable },
            ...EFFORTS.map(value => {
              const supported = current?.reasoningEfforts?.includes(value)
              return {
                value,
                label: value,
                disabled: !current?.selectable || !supported,
                note: supported ? null : '此型号未提供',
              }
            }),
          ],
    onPick(picked) {
      const effort = EFFORTS.find(value => value === picked)
      if (picked !== DEFAULT && effort === undefined) return
      void store.select(tenant, session, view.model, effort).then(tell)
    },
  })
  return (
    <HeadingChoice
      rank={FOLD_RANK.model}
      bar={
        <span className="omne-session-model" {...sessionHeaderModel.props}>
          <InlineChoice {...modelChoice(say)} />
          <InlineChoice {...effortChoice(say)} />
          {said === null ? null : <span role="status">{said}</span>}
        </span>
      }
      menu={tell => (
        <>
          <FoldedChoice {...modelChoice(tell)} />
          <FoldedChoice {...effortChoice(tell)} />
        </>
      )}
    />
  )
}
