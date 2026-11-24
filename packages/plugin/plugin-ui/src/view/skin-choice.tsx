import { RadioGroup, RadioGroupItem } from '@omne-harness/ui-kit'
import { useId, useSyncExternalStore, type JSX } from 'react'
import type { SkinNow, Wear, WearView } from '../looks.ts'
import type { LookChoice } from '../wear.ts'

const BUILTIN = 'builtin'
const SKIN = 'skin:'

const valueOf = (choice: LookChoice): string =>
  choice.kind === 'named' ? `${SKIN}${choice.name}` : choice.kind === 'builtin' ? BUILTIN : ''

const choiceOf = (value: string): LookChoice =>
  value.startsWith(SKIN) ? { kind: 'named', name: value.slice(SKIN.length) } : { kind: 'builtin' }

const NOTES: Readonly<Record<SkinNow['state'], (now: SkinNow, chosen: boolean) => string>> = {
  loaded: () => '',
  loading: (_, chosen) => (chosen ? '已选，正在装，装上就换' : '正在装'),
  failed: ({ reason }) => `没装上：${reason ?? '没有说原因'}`,
  held: () => '应用连着两次没起来，这一套已停下。发布新的一版，或禁用它',
}

/** What a row says of its skin, in the words of a person: nothing for one that is up and not worn. */
export function noteOf(now: SkinNow, { worn, choice }: WearView): string {
  if (worn === now.name) return '在用'
  return NOTES[now.state](now, choice.kind === 'named' && choice.name === now.name)
}

/** A skin a person can turn to now: one that failed or was held back waits for a new version. */
const usable = ({ state }: SkinNow): boolean => state === 'loaded' || state === 'loading'

/** Where a person switches the skin of the interface. It shows nothing until the skins are known, and nothing where there is none. */
export function SkinChoice({ wear }: { readonly wear: Wear }): JSX.Element | null {
  const view = useSyncExternalStore(wear.watch, wear.view, wear.view)
  const group = useId()
  if (view === undefined || !view.listed || view.skins.length === 0) return null
  const undecided = view.choice.kind === 'none'
  return (
    <fieldset className="plugin-skins">
      <legend>在用的皮肤</legend>
      <p className="plugin-skins-hint">
        {undecided ? '选一套，整个界面一起换。' : '点另一套，整个界面一起换。'}
        选择记在这台设备上。
      </p>
      <RadioGroup
        name={group}
        value={valueOf(view.choice)}
        onValueChange={value => wear.choose(choiceOf(value))}
      >
        <label className="plugin-skin">
          <RadioGroupItem value={BUILTIN} aria-label="自带的样子" />
          <span>自带的样子</span>
          <span className="plugin-skin-note">
            {view.worn === undefined && !undecided ? '在用' : ''}
          </span>
        </label>
        {view.skins.map(skin => (
          <label key={skin.name} className="plugin-skin">
            <RadioGroupItem
              value={`${SKIN}${skin.name}`}
              aria-label={skin.name}
              disabled={!usable(skin)}
            />
            <span>{skin.name}</span>
            <span className="plugin-skin-note">{noteOf(skin, view)}</span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  )
}
