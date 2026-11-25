import type { ReleaseRow, ToolReleaseDescriber } from '@omne-harness/tool-contract'
import type { ExtensionsArguments } from './protocol.ts'

const ACTIONS = {
  publish: '发布并持有',
  enable: '启用',
  disable: '禁用',
  remove: '移除',
  export: '取到工作区',
  configure: '改设置',
} as const
const VALUE_SHOWN_MAX = 400
type Writing = keyof typeof ACTIONS

/** What one write would do, for the person who releases it: the category, the name, where a publish comes from and where an export goes. */
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
  if (args.command === 'export')
    rows.push({ label: '写到哪', value: `工作区目录 ${args.params.dir}` })
  if (args.command === 'configure') {
    const { item, value, clear } = args.params
    const written = [...(JSON.stringify(value) ?? '没有给值')]
    const shown =
      written.length > VALUE_SHOWN_MAX
        ? `${written.slice(0, VALUE_SHOWN_MAX).join('')}…`
        : written.join('')
    rows.push(
      { label: '设置项', value: item },
      { label: '要写的值', value: clear === true ? '清除这一层的值' : shown },
    )
  }
  return { rows }
}
