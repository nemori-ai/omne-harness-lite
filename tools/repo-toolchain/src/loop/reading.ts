export type Reading<T> =
  | { readonly status: 'data'; readonly data: T }
  | { readonly status: 'no-data'; readonly reason: string }

export const data = <T>(value: T): Reading<T> => ({ status: 'data', data: value })
export const noData = <T = never>(reason: string): Reading<T> => ({ status: 'no-data', reason })
