import type { ToolExecutionContext, ToolExecutionScope } from '@omne-harness/tool-contract/provider'

/** Where the agent wants its session to work. A directory may be one that is not an instance yet. */
export type SwitchTarget =
  | Readonly<{ kind: 'directory'; directory: string }>
  | Readonly<{ kind: 'workspace'; workspace: string }>
  | Readonly<{ kind: 'none' }>

/** `half-done`: the directory was made an instance, and the session was not switched. */
export type SwitchAnswer =
  | Readonly<{ kind: 'switched'; directory: string | null; associated: boolean }>
  | Readonly<{ kind: 'refused'; reason: string }>
  | Readonly<{ kind: 'half-done'; associated: string; reason: string }>
  | Readonly<{ kind: 'unavailable'; diagnostic: string }>

/** What this tool needs of whoever runs it. The session and its tenant are the binder's to know. */
export type BoundWorkspaceSwitch = Readonly<{
  switch(target: SwitchTarget): Promise<SwitchAnswer>
}>

const attachments = new WeakMap<ToolExecutionContext, BoundWorkspaceSwitch>()

export function workspaceSwitchOf(context: ToolExecutionContext): BoundWorkspaceSwitch | undefined {
  return attachments.get(context)
}

export function attachWorkspaceSwitch(
  scope: ToolExecutionScope,
  bound: BoundWorkspaceSwitch,
): ToolExecutionScope {
  const { context, limits } = scope
  attachments.set(context, bound)
  let finished: ReturnType<ToolExecutionScope['finish']> | undefined
  return {
    context,
    limits,
    finish(exit) {
      if (finished !== undefined) return finished
      attachments.delete(context)
      finished = Promise.resolve().then(() => scope.finish(exit))
      return finished
    },
  }
}
