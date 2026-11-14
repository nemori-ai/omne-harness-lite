export type TaskScope = Readonly<{
  spawn(task: Promise<unknown>): void
  exit(): readonly unknown[]
}>

export type Spawn = Pick<TaskScope, 'spawn'>

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
