import type { ReleaseRow, ToolReleaseDescriber } from '@omne-harness/tool-contract'
import type { ArgumentsOf, NotificationsArguments } from './protocol.ts'

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

type SubscribeParams = ArgumentsOf<'subscribe'>['params']

const LEVELS = { off: '不收', weak: '弱提醒', strong: '强提醒' } as const

function scopeText(scope: SubscribeParams['scope']): string {
  if (scope === undefined || scope.kind === 'all') return '全部'
  return scope.kind === 'subject' ? `对象是「${scope.equals}」` : `对象以「${scope.prefix}」开头`
}

function termText(term: SubscribeParams['term']): string {
  if (term === undefined || term.kind === 'standing') return '一直有效'
  return term.kind === 'once' ? '只收下一条' : `到 ${term.at} 为止`
}

/** What one subscribe would set, for the person who releases it. The note is the agent's own words. */
export const describeSubscribe: ToolReleaseDescriber<NotificationsArguments> = async ({
  arguments: args,
}) => {
  if (args.command !== 'subscribe') throw new TypeError('only subscribe is described')
  const { source, type, scope, level, term, note } = args.params
  const rows: ReleaseRow[] = [
    { label: '来源', value: source },
    { label: '事件类型', value: type },
    { label: '范围', value: opening(scopeText(scope)) },
    { label: '强弱', value: LEVELS[level] },
    { label: '期限', value: termText(term) },
  ]
  if (note !== undefined) rows.push({ label: '备注（agent 填的）', value: opening(note) })
  return { rows }
}
