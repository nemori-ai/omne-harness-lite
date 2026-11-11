import type { GovernanceProviderClose } from './provider-lifetime.ts'

type Options = Readonly<{
  close: () => Promise<GovernanceProviderClose>
  observe: (report: GovernanceProviderClose) => void | Promise<void>
  onError: (error: unknown) => void
}>

export function retainGovernanceShutdown(options: Options) {
  let task: Promise<GovernanceProviderClose> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let closed = false
  let pendingReported = false

  function retry() {
    timer ??= setTimeout(() => {
      timer = undefined
      void close().catch(options.onError)
    }, 100)
    timer.unref()
  }

  function report(result: GovernanceProviderClose) {
    if (result.kind === 'pending' && pendingReported) return
    pendingReported = result.kind === 'pending'
    void Promise.resolve()
      .then(() => options.observe(result))
      .catch(options.onError)
  }

  function close(): Promise<GovernanceProviderClose> {
    if (closed) return Promise.resolve({ kind: 'closed' })
    task ??= options
      .close()
      .then(
        result => {
          if (result.kind === 'closed') {
            closed = true
            clearTimeout(timer)
          } else {
            retry()
          }
          report(result)
          return result
        },
        error => {
          retry()
          throw error
        },
      )
      .finally(() => {
        task = undefined
      })
    return task
  }
  return close
}
