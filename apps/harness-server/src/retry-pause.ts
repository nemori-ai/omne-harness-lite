export function pauseAfterFailures(failures: number): number {
  if (failures <= 1) return 1000
  return failures === 2 ? 5000 : 30_000
}
