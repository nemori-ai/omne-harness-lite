/**
 * 一个传感器这次有没有数据。没有数据要说清原因（配置里关了、没给基线、目录不存在……），
 * 不拿 0 冒充「量过了、没问题」。
 */
export type Reading<T> =
  | { readonly status: 'data'; readonly data: T }
  | { readonly status: 'no-data'; readonly reason: string }

export const data = <T>(value: T): Reading<T> => ({ status: 'data', data: value })
export const noData = <T = never>(reason: string): Reading<T> => ({ status: 'no-data', reason })
