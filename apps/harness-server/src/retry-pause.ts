/** The wait after a run of failures in a row: 1 s, then 5 s, then 30 s for every later failure. */
export function pauseAfterFailures(failures: number): number {
  if (failures <= 1) return 1000
  return failures === 2 ? 5000 : 30_000
}
