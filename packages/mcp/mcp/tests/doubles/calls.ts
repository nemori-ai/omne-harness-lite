export type Which = (call: number) => boolean

export const only =
  (n: number): Which =>
  call =>
    call === n

export const from =
  (n: number): Which =>
  call =>
    call >= n

export const between =
  (first: number, last: number): Which =>
  call =>
    call >= first && call <= last

export type Picker = Readonly<{
  calls: () => number
  next: () => boolean
}>

export function picker(which: Which): Picker {
  let count = 0
  return {
    calls: () => count,
    next: () => {
      count += 1
      return which(count)
    },
  }
}
