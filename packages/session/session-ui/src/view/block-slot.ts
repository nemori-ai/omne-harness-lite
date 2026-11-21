import { createContext, type ReactNode } from 'react'
import type { BlockSource } from '../model/conversation.ts'

/** Draws a block of a message that is not words; `fallback` is what stands there with no item. */
export type BlockSlot = (source: BlockSource, fallback: ReactNode) => ReactNode

export const BlockSlotContext = createContext<BlockSlot | null>(null)
