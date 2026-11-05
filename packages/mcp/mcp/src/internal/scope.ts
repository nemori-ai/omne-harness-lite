// The owner of the work the table leaves running in the background: what a port hands over after
// its bound, and a teardown or catalog mark that an `ensure` stopped waiting for at its bound. No
// promise runs detached: each background task is spawned here. A port cannot fail here, because
// every port call goes through `ask` (port.ts); what can is an error of this package, which the
// scope keeps until its exit, `closeAll`, hands it to the caller (SPEC P7).

export type TaskScope = Readonly<{
  /** Lets `task` run on in the background; an error it raises is kept, not lost. */
  spawn(task: Promise<unknown>): void
  /** The errors background tasks raised so far, oldest first. */
  defects(): readonly unknown[]
}>

export function createTaskScope(): TaskScope {
  const defects: unknown[] = []
  return {
    spawn(task) {
      task.then(undefined, (error: unknown) => {
        defects.push(error)
      })
    },
    defects: () => [...defects],
  }
}
