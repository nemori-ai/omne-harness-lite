export type Tone = 'neutral' | 'info' | 'good' | 'caution' | 'danger'

export type Fact =
  | 'in-progress'
  | 'waiting'
  | 'accepted'
  | 'done'
  | 'unknown'
  | 'failed'
  | 'dormant'
  | 'released'

export const FACT_TONE: Record<Fact, Tone> = {
  'in-progress': 'neutral',
  waiting: 'caution',
  accepted: 'neutral',
  done: 'good',
  unknown: 'neutral',
  failed: 'danger',
  dormant: 'neutral',
  released: 'neutral',
}

export const TONE_SURFACE: Record<Tone, string> = {
  neutral: 'bg-hover text-ink-muted shadow-hairline',
  info: 'pe-tone pe-tone-info bg-info-fill text-info-ink',
  good: 'pe-tone pe-tone-good bg-good-fill text-good-ink',
  caution: 'pe-tone pe-tone-caution bg-caution-fill text-caution-ink',
  danger: 'pe-tone pe-tone-danger bg-danger-fill text-danger-ink',
}

export const TONE_INK: Record<Tone, string> = {
  neutral: 'text-ink-muted',
  info: 'text-info-ink',
  good: 'text-good-ink',
  caution: 'text-caution-ink',
  danger: 'text-danger-ink',
}

export const FACT_INK: Record<Fact, string> = {
  ...(Object.fromEntries(
    Object.entries(FACT_TONE).map(([fact, tone]) => [fact, TONE_INK[tone]]),
  ) as Record<Fact, string>),
  dormant: 'text-ink-faint',
}

export const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-ink-faint text-surface-overlay',
  info: 'bg-accent text-surface-overlay',
  good: 'bg-good-ink text-surface-overlay',
  caution: 'bg-caution-ink text-surface-overlay',
  danger: 'bg-danger-ink text-surface-overlay',
}
