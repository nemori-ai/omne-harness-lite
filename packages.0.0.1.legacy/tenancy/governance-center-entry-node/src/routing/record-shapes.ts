/** 走到了判定次序的哪一步（S-10 的步）。 */
export type Stage =
  | 'public-health'
  | 'version'
  | 'envelope'
  | 'payload'
  | 'authenticate'
  | 'derive'
  | 'gate'
  | 'operation'

/** `login-state-rejected` 时可以区分到这一步（S-30 末条）：查过了不认的三种内部分不出。 */
export type Rejection = 'absent' | 'multiple' | 'malformed' | 'judged'

/** 入口层发起的哪一次调用。 */
export type Call = 'authenticate' | 'credentials' | 'derive' | 'gate' | 'operation'

export interface Observed {
  readonly call: Call
  /** 参与方给出的失败值的名字、`throw:<异常类型>`、或矛盾清单的哪一项；不含值与消息里的数据。 */
  readonly value: string
}

export interface RequestRecord {
  readonly stage: Stage
  /** 路由标识（只在它在路由表里时）。 */
  readonly route?: string
  /** 入口答复之一、`public-health`、`result` 或 `failure:<具名值>`；关连接不写时为 `none`。 */
  readonly answer: string
  readonly rejection?: Rejection
  /** 答 `unavailable` 或记缺陷时，入口层观察到的失败值。 */
  readonly observed?: Observed
  /** 记为缺陷（S-14）。 */
  readonly defect?: boolean
  /** 关联号（不可逆），不是身份值。 */
  readonly account?: string
  readonly tenant?: string
}

/** 异常只记类型名。 */
export function thrownValue(error: unknown): string {
  return error instanceof Error ? `throw:${error.name}` : 'throw:non-error'
}
