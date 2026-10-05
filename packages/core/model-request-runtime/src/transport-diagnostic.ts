export interface Diagnostic {
  readonly kind: string
  readonly level: 'info' | 'error'
}
