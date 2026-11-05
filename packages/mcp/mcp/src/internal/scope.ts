// The owner of the work the table leaves running in the background: what a port hands over after
// its bound, and a teardown or catalog mark that an `ensure` stopped waiting for at its bound. No
// promise runs detached: each background task is spawned here. A port cannot fail here, because
// every port call goes through `ask` (port.ts); what can is an error of this package. The scope
// keeps such an error until its exit, `closeAll`, hands it to the caller (SPEC P7). A task can
// outlive the exit, because a port may never answer (A1); an error it raises later has no caller
// left and goes to `afterExit`.

export type TaskScope = Readonly<{
  /** Lets `task` run on in the background; an error it raises is kept, not lost. */
  spawn(task: Promise<unknown>): void
  /** Takes the errors kept so far, oldest first. Errors raised from then on go to `afterExit`. */
  exit(): readonly unknown[]
}>

/** Throws `error` outside any promise, where the host's handler of uncaught exceptions sees it. */
function throwUncaught(error: unknown): void {
  queueMicrotask(() => {
    throw error
  })
}

export function createTaskScope(afterExit: (error: unknown) => void = throwUncaught): TaskScope {
  let kept: unknown[] | undefined = []
  return {
    spawn(task) {
      task.then(undefined, (error: unknown) => {
        if (kept === undefined) afterExit(error)
        else kept.push(error)
      })
    },
    exit() {
      const taken = kept ?? []
      kept = undefined
      return taken
    },
  }
}
