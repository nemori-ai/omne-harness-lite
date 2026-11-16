import type { HistoryEntry } from '@omne-harness/session-contract'
import { readEntryText, readEntryTexts, writeEntryText } from '../../src/entry-codec.ts'

export const storedText = (entry: object): string => writeEntryText(entry as HistoryEntry)

export const entryOfText = (text: string): HistoryEntry => readEntryText(text)

export const pageEntries = (output: Readonly<Record<string, unknown>>): HistoryEntry[] =>
  readEntryTexts(output['entries'])
