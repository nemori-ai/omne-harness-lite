import {
  chordLabel,
  chordOf,
  judgeBinding,
  keymapOf,
  type ActionItem,
  type KeymapRow,
} from '@omne-harness/shell-contract'
import {
  EditIcon,
  IconButton,
  InlineNotice,
  PageColumn,
  PageHeader,
  SearchIcon,
  Table,
  TableBody,
  TableCell,
  TableRow,
  UndoIcon,
  ValuePill,
} from '@omne-harness/ui-kit'
import { useEffect, useState, useSyncExternalStore } from 'react'
import type { KeyBindings, SaveState } from '../model/bindings.ts'

type Actions = Readonly<{
  items(): readonly ActionItem[]
  subscribe(listener: () => void): () => void
}>

const GROUPS: readonly (readonly [string, (action: ActionItem) => boolean])[] = [
  ['系统命令', action => action.kind === 'command' && action.group === '系统命令'],
  ['提示词命令', action => action.kind === 'command' && action.group === '提示词命令'],
  ['控制', action => action.kind === 'control'],
  ['界面动作', action => action.kind === 'ui'],
]

const slashOf = (action: ActionItem): string =>
  action.slash ?? `/${action.id.slice(action.id.lastIndexOf('.') + 1)}`

const SAVED: Readonly<Record<SaveState['kind'], string>> = {
  saved: '改动存在账号名下',
  saving: '正在存到账号名下……',
  unsaved: '',
}

type Asking =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'key'; action: ActionItem }>
  | Readonly<{ kind: 'which' }>
type Told =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'refused'; why: string; swap?: () => void }>
  | Readonly<{ kind: 'found'; text: string }>

/** Waits for one key in the capture phase, ahead of the dispatcher; Escape gives up. */
function useOneKey(asking: Asking, mac: boolean, take: (chord: string | null) => void): void {
  useEffect(() => {
    if (asking.kind === 'idle') return
    const onKey = (event: KeyboardEvent): void => {
      if (event.isComposing) return
      const chord = chordOf(event, mac)
      if (chord === null) return
      event.preventDefault()
      event.stopPropagation()
      take(chord === 'Escape' ? null : chord)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [asking, mac, take])
}

type Row = Readonly<{
  action: ActionItem
  keyed: KeymapRow | undefined
  changed: boolean
  mac: boolean
  onRebind: () => void
  onReset: () => void
}>

function ActionRow({ action, keyed, changed, mac, onRebind, onReset }: Row) {
  const can = action.available()
  return (
    <TableRow>
      <TableCell>
        <code>{slashOf(action)}</code>
      </TableCell>
      <TableCell>{action.title}</TableCell>
      <TableCell>
        {keyed === undefined ? '—' : chordLabel(keyed.chord, mac)}
        {changed ? <ValuePill>改过</ValuePill> : null}
      </TableCell>
      <TableCell>{can === true ? '能用' : can}</TableCell>
      <TableCell>
        {action.kind === 'command' ? null : (
          <IconButton label="改键" size="icon-compact" onClick={onRebind}>
            <EditIcon aria-hidden="true" />
          </IconButton>
        )}
        {changed ? (
          <IconButton label="恢复缺省" size="icon-compact" onClick={onReset}>
            <UndoIcon aria-hidden="true" />
          </IconButton>
        ) : null}
      </TableCell>
    </TableRow>
  )
}

function Notices({
  asking,
  told,
  dismiss,
}: {
  readonly asking: Asking
  readonly told: Told
  readonly dismiss: () => void
}) {
  return (
    <>
      {asking.kind === 'idle' ? null : (
        <InlineNotice
          tone="info"
          title={asking.kind === 'key' ? `请按「${asking.action.title}」的新键` : '请按一个键'}
        >
          Esc 放弃。
        </InlineNotice>
      )}
      {told.kind === 'refused' ? (
        <InlineNotice
          tone="caution"
          title={told.why}
          {...(told.swap === undefined ? {} : { action: { label: '换过来', onClick: told.swap } })}
          onDismiss={dismiss}
        />
      ) : null}
      {told.kind === 'found' ? (
        <InlineNotice tone="neutral" title={told.text} onDismiss={dismiss} />
      ) : null}
    </>
  )
}

/** What one key pressed for a row or for a look-up comes to: a change, a refusal that may swap, or who holds it. */
function useKeyAnswers(all: readonly ActionItem[], bindings: KeyBindings, mac: boolean) {
  const changes = useSyncExternalStore(bindings.subscribe, bindings.changes)
  const [asking, setAsking] = useState<Asking>({ kind: 'idle' })
  const [told, setTold] = useState<Told>({ kind: 'none' })
  const keymap = keymapOf(all, changes, mac)
  const keyOf = (id: string): KeymapRow | undefined => keymap.find(row => row.action === id)
  const give = (action: ActionItem, chord: string): void => {
    const judged = judgeBinding(keymap, action, chord)
    if (judged.ok) return void bindings.change({ ...changes, [action.id]: judged.chord })
    const { clash } = judged
    const mine = keyOf(action.id)?.chord ?? null
    const swap = (other: string) => () => {
      void bindings.change({ ...changes, [action.id]: chord, [other]: mine })
      setTold({ kind: 'none' })
    }
    setTold({
      kind: 'refused',
      why: judged.why,
      ...(clash === undefined ? {} : { swap: swap(clash) }),
    })
  }
  const holders = (chord: string): string => {
    const held = keymap.filter(row => row.chord === chord).map(row => row.action)
    const names = held.map(id => all.find(action => action.id === id)?.title ?? id)
    return `${chordLabel(chord, mac)}：${names.length === 0 ? '没有绑到任何命令' : names.join('、')}`
  }
  useOneKey(asking, mac, chord => {
    const now = asking
    setAsking({ kind: 'idle' })
    if (chord === null) return
    if (now.kind === 'key') give(now.action, chord)
    if (now.kind === 'which') setTold({ kind: 'found', text: holders(chord) })
  })
  const reset = (id: string): void => {
    const { [id]: _gone, ...rest } = changes
    void bindings.change(rest)
  }
  return { changes, asking, setAsking, told, setTold, keyOf, reset }
}

export function KeysPage({
  actions,
  bindings,
  mac,
}: {
  readonly actions: Actions
  readonly bindings: KeyBindings
  readonly mac: boolean
}) {
  const all = useSyncExternalStore(actions.subscribe, actions.items)
  const state = useSyncExternalStore(bindings.subscribe, bindings.state)
  const { changes, asking, setAsking, told, setTold, keyOf, reset } = useKeyAnswers(
    all,
    bindings,
    mac,
  )
  return (
    <PageColumn>
      <PageHeader
        title="命令与快捷键"
        description={state.kind === 'unsaved' ? state.why : SAVED[state.kind]}
        actions={
          <>
            <IconButton label="按一个键查它绑在哪" onClick={() => setAsking({ kind: 'which' })}>
              <SearchIcon aria-hidden="true" />
            </IconButton>
            <IconButton label="全部恢复缺省" onClick={() => void bindings.change({})}>
              <UndoIcon aria-hidden="true" />
            </IconButton>
          </>
        }
      />
      <Notices asking={asking} told={told} dismiss={() => setTold({ kind: 'none' })} />
      {GROUPS.map(([group, belongs]) => {
        const members = all.filter(belongs)
        if (members.length === 0) return null
        return (
          <section key={group} aria-label={group}>
            <h2 className="omne-section-title">{group}</h2>
            <Table>
              <TableBody>
                {members.map(action => (
                  <ActionRow
                    key={action.id}
                    action={action}
                    keyed={keyOf(action.id)}
                    changed={Object.hasOwn(changes, action.id)}
                    mac={mac}
                    onRebind={() => setAsking({ kind: 'key', action })}
                    onReset={() => reset(action.id)}
                  />
                ))}
              </TableBody>
            </Table>
          </section>
        )
      })}
    </PageColumn>
  )
}
