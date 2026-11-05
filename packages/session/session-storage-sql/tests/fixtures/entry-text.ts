// The stored text of one `sl_entry` row as the tests write and read it, through the same codec the
// participant and the read handlers use (src/entry-codec.ts). The codec bench and the row-level
// tests import it from here, so a bench of another tree swaps only this file.
import type { HistoryEntry } from '@omne-harness/session-contract'
import { readEntryText, readEntryTexts, writeEntryText } from '../../src/entry-codec.ts'

/** The `entry` text of one row. */
export const storedText = (entry: object): string => writeEntryText(entry as HistoryEntry)

/** The entry of one row's `entry` text. */
export const entryOfText = (text: string): HistoryEntry => readEntryText(text)

/** The entries of one `session.history` handler page, decoded as the port decodes them. */
export const pageEntries = (output: Readonly<Record<string, unknown>>): HistoryEntry[] =>
  readEntryTexts(output['entries'])
