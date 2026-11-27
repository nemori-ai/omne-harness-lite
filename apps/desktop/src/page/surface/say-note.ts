import type { SayNote } from '@omne-harness/ui-kit'
import type { NoteTo, SceneNote } from '../desk/scene.ts'

/** A picture of the note with its bytes at hand. */
export type Shown = Readonly<{ id: string; name: string; bytes: Uint8Array<ArrayBuffer> }>

const NEW_ID = 'new'
const KEY_ID = 'to:'
export const NEW_TARGET = '新会话'

export const idOf = (to: NoteTo): string => (to.kind === 'new' ? NEW_ID : `${KEY_ID}${to.key}`)
export const toOf = (id: string): NoteTo =>
  id.startsWith(KEY_ID) ? { kind: 'target', key: id.slice(KEY_ID.length) } : { kind: 'new' }

const among = (id: string, note: SceneNote): boolean =>
  id === NEW_ID || note.targets?.some(({ key }) => idOf({ kind: 'target', key }) === id) === true

/** The note of a scene as the say bubble draws it, on either surface: who it goes to is the one chosen while still among the targets, else the default. */
export function sayNote(
  note: SceneNote | null,
  text: string,
  chosen: string | null,
  pictures: readonly Shown[],
): SayNote | null {
  if (note === null) return null
  const targets = note.targets?.map(({ key, label }) => ({
    id: idOf({ kind: 'target', key }),
    name: label,
  }))
  return {
    targets: targets === undefined ? undefined : [{ id: NEW_ID, name: NEW_TARGET }, ...targets],
    target: chosen !== null && among(chosen, note) ? chosen : idOf(note.to),
    text,
    fate: note.fate ?? undefined,
    pictures,
    told: note.told,
  }
}
