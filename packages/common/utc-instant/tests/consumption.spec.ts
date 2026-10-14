import { expect, it } from 'vitest'
import {
  encodeDuration,
  encodeInstant,
  parseDuration,
  parseInstant,
} from '@omne-harness/utc-instant'

it('a consumer round-trips an instant and a duration through the package name alone', () => {
  const at = parseInstant('2026-10-14T12:00:00.5005Z')
  const timeout = parseDuration('PT30.25S')
  if (!at.ok || !timeout.ok) throw new Error('expected both texts to parse')
  expect(encodeInstant(at.value)).toBe('2026-10-14T12:00:00.5005Z')
  expect(encodeDuration(timeout.value)).toBe('PT30.25S')
})
