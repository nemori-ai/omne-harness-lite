import type { SessionState } from './root.ts'
export interface SessionDirectory {
  entries(): IterableIterator<[string, SessionState]>
  get(key: string): SessionState | undefined
  set(key: string, value: SessionState): void
  values(): IterableIterator<SessionState>
  gate(key: string): string | null
}
