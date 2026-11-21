import {
  DropdownMenuItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@omne-harness/ui-kit'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import {
  MODE_LABELS,
  type PermissionMode,
  type PermissionModeStore,
} from '../model/permission-mode.ts'
import { FOLD_RANK, FoldedChoice, HeadingChoice, useHeadingPlace } from './heading-fold.tsx'

type Props = Readonly<{ store: PermissionModeStore; tenant: string; session: string }>

const MODES = Object.keys(MODE_LABELS) as PermissionMode[]

const modeOf = (value: string): PermissionMode | undefined => MODES.find(mode => mode === value)

const OPTIONS = MODES.map(mode => ({ value: mode, label: MODE_LABELS[mode] }))

/** How the session handles permissions: a quiet dropdown in the heading whose face is the mode in force. */
export function PermissionModeAction({ store, tenant, session }: Props) {
  const inBar = useHeadingPlace() === 'bar'
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(tenant, session, listener),
    [store, tenant, session],
  )
  const view = useSyncExternalStore(subscribe, () => store.read(tenant, session))
  const [said, say] = useState<string | null>(null)
  useEffect(() => {
    if (inBar) void store.load(tenant, session)
  }, [store, tenant, session, inBar])
  if (view.kind === 'unread') return null
  if (view.kind === 'unreadable') {
    const reason = `权限处理读不到：${view.reason}`
    return (
      <HeadingChoice
        rank={FOLD_RANK.mode}
        bar={
          <span className="omne-session-mode" role="status">
            {reason}
          </span>
        }
        menu={() => <DropdownMenuItem disabled>{reason}</DropdownMenuItem>}
      />
    )
  }
  const change = (value: string, tell: (text: string) => void) => {
    const mode = modeOf(value)
    if (mode !== undefined) void store.change(tenant, session, mode).then(tell)
  }
  return (
    <HeadingChoice
      rank={FOLD_RANK.mode}
      bar={
        <span className="omne-session-mode">
          <Select value={view.mode} onValueChange={value => change(value, say)}>
            <SelectTrigger aria-label="权限处理" size="sm">
              <SelectValue>{MODE_LABELS[view.mode]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {MODES.map(mode => (
                <SelectItem key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {said === null ? null : <span role="status">{said}</span>}
        </span>
      }
      menu={tell => (
        <FoldedChoice
          label="权限处理"
          value={view.mode}
          shown={MODE_LABELS[view.mode]}
          options={OPTIONS}
          onPick={value => change(value, tell)}
        />
      )}
    />
  )
}
