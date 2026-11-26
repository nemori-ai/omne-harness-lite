// Run as a process: installs the fall watch, then falls in the way its argument names.
import { attributed, watchFalls } from '../../dist/index.js'

watchFalls({
  record: fall => process.stdout.write(`${JSON.stringify(fall)}\n`),
  exit: code => process.exit(code),
})
const fail = () => {
  throw new Error('guest broke')
}
const ways = {
  'sync-later': () => attributed('plugin:a', () => void queueMicrotask(fail)),
  timer: () => attributed('plugin:a', () => void setTimeout(fail, 5)),
  rejection: () => attributed('plugin:a', () => void Promise.reject(new Error('guest rejected'))),
  'after-await': () =>
    attributed('plugin:a', async () => {
      await new Promise(done => setTimeout(done, 5))
      queueMicrotask(fail)
    }),
  nested: () =>
    attributed('plugin:a', () => attributed('plugin:b', () => void queueMicrotask(fail))),
  outside: () => {
    attributed('plugin:a', () => undefined)
    queueMicrotask(fail)
  },
  'outside-rejection': () => void Promise.reject(new Error('host rejected')),
}
ways[process.argv[2]]()
setTimeout(() => process.exit(0), 2000)
