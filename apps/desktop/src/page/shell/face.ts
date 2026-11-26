import type { PreferenceStore } from './theme.ts'

export const FACE_KEY = 'omne.face'

export type Face = 'front' | 'back'

export type FacePreference = {
  read(): Face
  write(face: Face): void
}

/** Which face this device last stayed on; the first time, or anything unreadable, is the front. */
export function storedFacePreference(store: () => PreferenceStore): FacePreference {
  return {
    read() {
      try {
        return store().getItem(FACE_KEY) === 'back' ? 'back' : 'front'
      } catch {
        return 'front'
      }
    },
    write(face) {
      try {
        store().setItem(FACE_KEY, face)
      } catch {}
    },
  }
}
