export async function drain(
  settled: Promise<unknown>,
  timeoutMs: number,
): Promise<'settled' | 'retained'> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      settled.then(() => 'settled' as const),
      new Promise<'retained'>(resolve => {
        timer = setTimeout(() => resolve('retained'), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
