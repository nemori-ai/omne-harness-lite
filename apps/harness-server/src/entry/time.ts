import { systemTime } from '@omne-harness/time-source'
import type { EntryEnv, EntryTime } from '../types.ts'

const TIME = Symbol('entry time')

const hostTime = (): EntryTime => Object.freeze({ source: systemTime(), protocol: 'system-clock' })

export const timeOf = (env: EntryEnv): EntryTime => env.time ?? env.once(TIME, hostTime)
