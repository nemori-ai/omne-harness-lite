import { resultOf } from './hook-job.ts'
import { jobOf, type ChildMessage } from './hook-process.ts'

const send = (message: ChildMessage, then: (error: Error | null) => void = () => {}) => {
  if (process.send === undefined)
    throw new Error('量读数的子进程要由 hook-process.ts 起，带消息通道')
  process.send(message, then)
}

const result = resultOf(jobOf(process.argv[2]), commit => send({ kind: 'prepared', commit }))
send(result, () => process.exit(0))
