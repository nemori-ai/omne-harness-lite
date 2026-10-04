import { Service, type Context } from '@deepseek-ai/cordis'
import type { EntryOpeningSignal } from './index.ts'

/** @owner packages/core/governance-center-entry */
export abstract class EntryOpening extends Service implements EntryOpeningSignal {
  static readonly provide = 'entryOpening' as const
  constructor(ctx: Context) {
    super(ctx, EntryOpening.provide)
  }
  abstract wait: EntryOpeningSignal['wait']
  abstract isOpen: EntryOpeningSignal['isOpen']
}
export const ENTRY_OPENING_SERVICE = EntryOpening.provide

declare module '@deepseek-ai/cordis' {
  interface Context {
    entryOpening: EntryOpening
  }
}
