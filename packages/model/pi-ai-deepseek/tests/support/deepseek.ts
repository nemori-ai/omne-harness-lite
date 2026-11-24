import { afterAll } from 'vitest'
import { openTestFamily } from './family-config.ts'

const { family, close } = await openTestFamily()
afterAll(close)
export const FAMILY = family
