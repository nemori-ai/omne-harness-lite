import type { Notice } from './session-machine.ts'

const SENTENCES: Readonly<Record<string, string>> = {
  limited: '超过了服务端的限额。',
  invalid: '服务端认为这个请求的内容不合规定。',
  conflict: '和服务端已有的记录冲突。',
  archived: '这个会话已归档，不能再发消息。',
  frozen: '这个会话已冻结，不能再发消息。',
  denied: '没有权限，或登录已失效。',
  'not-found': '服务端找不到这一轮。',
  'protocol-rejected': '服务端不认这个请求的格式。',
  'basis-unavailable': '服务端暂时不能处理，稍后再试。',
  'stage-not-provided': '这个部署没有提供这个操作。',
  'uniform-auth-failure': '登录没有通过。',
}

export function refused(outcome: string, prefix: string, reason?: string): Notice {
  const sentence = SENTENCES[outcome] ?? `服务端答复「${outcome}」。`
  return reason === undefined
    ? { kind: 'refused', text: `${prefix}${sentence}` }
    : { kind: 'refused', text: `${prefix}${sentence}原因：${reason}`, reason }
}

export const NOT_SENT = (what: string): Notice => ({
  kind: 'unavailable',
  text: `连不上服务，${what}没有发出去。`,
})
export const UNKNOWN = (what: string): Notice => ({
  kind: 'unknown',
  text: `${what}的结果未知，正在确认。`,
})
export const STILL_UNKNOWN = (what: string): Notice => ({
  kind: 'unknown',
  text: `${what}的结果仍然未知。可以再确认一次。`,
})
