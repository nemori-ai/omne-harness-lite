export type Notice = Readonly<{ kind: 'refused' | 'unavailable' | 'unknown'; text: string }>

/** What every write and read of this module says for the outcomes that mean the same everywhere. */
export const COMMON_SENTENCES = {
  denied: '没有权限，或登录已失效。',
  'protocol-rejected': '服务端不认这个请求的格式。',
  unavailable: '没有发出去。',
  uncertain: '没有收到可信的答复。',
} as const

/** Not sent and not answered are worth trying again; every other refusal is the server's answer. */
export const refusal = (outcome: string, text: string): Notice => ({
  kind: outcome === 'unavailable' || outcome === 'uncertain' ? 'unavailable' : 'refused',
  text,
})
