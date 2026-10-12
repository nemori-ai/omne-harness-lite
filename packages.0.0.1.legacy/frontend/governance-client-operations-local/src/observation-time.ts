/** CG1 S9 / D047: display provenance only. Never a center authorization clock. */
export function observationTime(): string {
  return new Date().toISOString()
}
