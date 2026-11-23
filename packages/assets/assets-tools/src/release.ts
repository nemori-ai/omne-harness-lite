import type { ReleaseRow, ToolReleaseDescriber } from '@omne-harness/tool-contract'
import type { ExtensionsArguments } from './protocol.ts'

const ACTIONS = { publish: '发布并持有', enable: '启用', disable: '禁用', remove: '移除' } as const
type Writing = keyof typeof ACTIONS

/** What one write would do, for the person who releases it: the category, the name and where a publish comes from. */
export const describeWrite: ToolReleaseDescriber<ExtensionsArguments> = async ({
  arguments: args,
}) => {
  if (!(args.command in ACTIONS)) throw new TypeError('only the writes are described')
  const command = args.command as Writing
  const { category, name } = args.params as Readonly<{ category: string; name: string }>
  const rows: ReleaseRow[] = [
    { label: '动作', value: ACTIONS[command] },
    { label: '类别', value: category },
    { label: '名字', value: name },
  ]
  if (args.command === 'publish')
    rows.push({
      label: '从哪发布',
      value: args.params.dir === undefined ? '一份正文' : `工作区目录 ${args.params.dir}`,
    })
  return { rows }
}
