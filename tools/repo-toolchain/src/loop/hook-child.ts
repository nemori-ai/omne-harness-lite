// 收工钩子量读数的子进程：读命令行里的任务，做完把结果发回主进程。做什么在 hook-job.ts，输入与发回的消息见 hook-process.ts。
// 量的过程是同步的，放在子进程里主进程才能按时限整组终止它。
import { resultOf } from './hook-job.ts'
import { jobOf, type ChildMessage } from './hook-process.ts'

const send = (message: ChildMessage, then: (error: Error | null) => void = () => {}) => {
  if (process.send === undefined)
    throw new Error('量读数的子进程要由 hook-process.ts 起，带消息通道')
  process.send(message, then)
}

const result = resultOf(jobOf(process.argv[2]), commit => send({ kind: 'prepared', commit }))
// 发完就退出：消息通道开着时进程不会自己结束。
send(result, () => process.exit(0))
