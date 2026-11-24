import { PART_ATTRIBUTE, type ActionItem, type ActionKey } from '@omne-harness/shell-contract'
import {
  blockingOverlay,
  moveRegion,
  reachable,
  stepSize,
  type SizeController,
  type SizeStep,
} from '@omne-harness/ui-kit'
import { shellSidebarFold, shellSidebarMenu } from './parts.ts'

const GROUP = '版式'
const always = (): true => true
const at = (layer: ActionKey['layer'], ...chords: readonly string[]): readonly ActionKey[] =>
  chords.map(chord => ({ chord, layer }))
const everywhere = (...chords: readonly string[]): readonly ActionKey[] => [
  ...at('global', ...chords),
  ...at('overlay', ...chords),
]

/** F6 and Shift+F6: the shell's own regions, in page order. */
export function regionActions(): readonly ActionItem[] {
  return [
    {
      id: 'shell.next-region',
      title: '下一个区域',
      group: GROUP,
      kind: 'ui',
      order: 10,
      keys: at('global', 'F6'),
      available: always,
      run: () => void moveRegion('next'),
    },
    {
      id: 'shell.prev-region',
      title: '上一个区域',
      group: GROUP,
      kind: 'ui',
      order: 11,
      keys: at('global', 'Shift+F6'),
      available: always,
      run: () => void moveRegion('previous'),
    },
  ]
}

/** The size tiers by key, over a menu too, as before they were actions. */
export function sizeActions(size: Pick<SizeController, 'current' | 'set'>): readonly ActionItem[] {
  const step = (by: SizeStep) => (): void => size.set(stepSize(size.current(), by))
  const item = (
    id: string,
    title: string,
    order: number,
    by: SizeStep,
    keys: readonly ActionKey[],
  ) =>
    ({
      id,
      title,
      group: GROUP,
      kind: 'ui',
      order,
      keys,
      repeat: true,
      available: always,
      run: step(by),
    }) as const
  return [
    item(
      'shell.bigger',
      '字号大一档',
      20,
      'larger',
      everywhere('Mod+=', 'Mod+Shift+=', 'Mod+Plus'),
    ),
    item('shell.smaller', '字号小一档', 21, 'smaller', everywhere('Mod+-', 'Mod+Shift+-', 'Mod+_')),
    item('shell.reset-size', '字号回到中楷', 22, 'standard', everywhere('Mod+0')),
  ]
}

const FOLD = [shellSidebarFold, shellSidebarMenu]
  .map(part => `[${PART_ATTRIBUTE}="${part.name}"]`)
  .join(',')
/** The sidebar's fold a person could press now: the one on a folded face is not there. */
const foldButton = (): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>(FOLD)].find(reachable)

let closing = false

/** ⌘B, and Escape for the innermost layer: what the shell itself draws. */
export function frameActions(): readonly ActionItem[] {
  return [
    {
      id: 'shell.sidebar',
      title: '展开或收起侧栏',
      group: GROUP,
      kind: 'ui',
      order: 30,
      keys: at('global', 'Mod+B'),
      available: () => (foldButton() === undefined ? '这时没有侧栏' : true),
      run: () => foldButton()?.click(),
    },
    {
      id: 'shell.close-layer',
      title: '关上最里面的一层',
      group: GROUP,
      kind: 'ui',
      order: 31,
      keys: at('overlay', 'Escape'),
      available: () => (blockingOverlay() === undefined ? '没有开着的一层' : true),
      run: () => {
        const overlay = blockingOverlay()
        if (overlay === undefined || closing) return
        closing = true
        try {
          overlay.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
          )
        } finally {
          closing = false
        }
      },
    },
  ]
}

type FaceTurn = Readonly<{ two: { get(): boolean }; turn(): void }>

/** Turning to the other face: there is no such action before the login, nor while there is no back to turn to. */
export function faceActions(face: FaceTurn, signedIn: boolean): readonly ActionItem[] {
  if (!signedIn || !face.two.get()) return []
  return [
    {
      id: 'shell.turn-face',
      title: '翻到另一面',
      group: GROUP,
      kind: 'ui',
      order: 32,
      keys: at('global', 'Mod+Shift+O'),
      available: always,
      run: () => face.turn(),
    },
  ]
}
