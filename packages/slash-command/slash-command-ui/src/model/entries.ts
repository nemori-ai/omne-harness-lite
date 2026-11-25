import type { ActionItem } from '@omne-harness/shell-contract'
import type { SlashCommandCatalog, SlashCommandEntry } from '@omne-harness/slash-command-protocol'
import type { Answer } from './ports.ts'

/** What the module may do to the composer on show; each answers why not when none is open. */
export type ComposerWriter = Readonly<{
  write(text: string): true | string
  say(text: string): true | string
}>

const GROUPS: Readonly<Record<SlashCommandEntry['kind'], string>> = {
  system: '系统命令',
  prompt: '提示词命令',
  reference: 'Skill',
}

/** A system command that takes nothing runs as it is; every other entry is written into the composer to go on. */
export function entryActions(
  catalog: SlashCommandCatalog,
  writer: () => ComposerWriter | undefined,
): readonly ActionItem[] {
  return catalog.entries.map((entry, order) => {
    const slash = `/${entry.name}`
    const runs = entry.kind === 'system' && entry.hint === undefined
    return {
      id: `slash-command.${entry.full}`,
      title: entry.title,
      group: GROUPS[entry.kind],
      kind: 'command',
      order: 100 + order,
      slash,
      available: () => entry.unavailable ?? (writer() === undefined ? '没有打开的输入框' : true),
      run: () => {
        const done = runs ? writer()?.say(slash) : writer()?.write(`${slash} `)
        if (done !== true) throw new Error(done ?? '没有打开的输入框')
      },
    } satisfies ActionItem
  })
}

const SHORT = /^\/([\w-]+)$/u

/** A control or an interface action typed whole runs where it is typed; one on the composer's words does not. */
export function typedAction(text: string, actions: readonly ActionItem[]): ActionItem | undefined {
  const name = SHORT.exec(text.trim())?.[1]
  if (name === undefined) return undefined
  return actions.find(
    action =>
      action.kind !== 'command' &&
      action.id.slice(action.id.lastIndexOf('.') + 1) === name &&
      !(action.keys ?? []).some(key => key.layer === 'composer'),
  )
}

export const CLEARED: Answer = { kind: 'edit', text: '', caret: 0 }
