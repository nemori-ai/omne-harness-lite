import { createContext, type ReactNode } from 'react'
import type { BlockSource, Part } from '../model/conversation.ts'

/** Draws a block of a message that is not words, by its kind; `fallback` is what stands there with no drawing. */
export type BlockSlot = (kind: string, source: BlockSource, fallback: ReactNode) => ReactNode

export const BlockSlotContext = createContext<BlockSlot | null>(null)

export type ToolCallPart = Extract<Part, { kind: 'tool-call' }>

/** Draws a call of a tool, by the name of the tool; `generic` is the line the transcript draws itself. */
export type ToolCallSlot = (part: ToolCallPart, generic: () => ReactNode) => ReactNode

export const ToolCallSlotContext = createContext<ToolCallSlot | null>(null)

/** What a person can do to a call the run waits on: send it to the background, or stop it. */
export type CallControlSlot = Readonly<{
  background: (call: string) => void
  stop: (call: string) => void
}>

export const CallControlContext = createContext<CallControlSlot | null>(null)
