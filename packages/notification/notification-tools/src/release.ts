import type { ReleaseRow, ToolReleaseDescriber } from '@omne-harness/tool-contract'
import type { NotificationsArguments } from './protocol.ts'

const TEXT_LIMIT = 500

function opening(text: string): string {
  const points = [...text]
  return points.length <= TEXT_LIMIT ? text : `${points.slice(0, TEXT_LIMIT - 1).join('')}…`
}

/** What one send would post, for the person who releases it: always to the owner, as the call wrote it. */
export const describeSend: ToolReleaseDescriber<NotificationsArguments> = async ({
  arguments: args,
}) => {
  if (args.command !== 'send') throw new TypeError('only send is described')
  const { title, body, replace, renotify } = args.params
  const rows: ReleaseRow[] = [
    { label: '收件人', value: '你' },
    { label: '标题', value: opening(title) },
  ]
  if (body !== undefined && body.trim() !== '') rows.push({ label: '正文', value: opening(body) })
  if (replace !== undefined)
    rows.push(
      { label: '替换', value: `顶替替换键为「${replace}」的旧一条` },
      { label: '顶替时再提醒', value: renotify === true ? '是' : '否' },
    )
  return { rows }
}
