import type { Parsed } from '@omne-harness-lite/identity-values'

/** Validate the display attribute without changing its stored value. */
export function parseOrganizationName(value: unknown): Parsed<string> {
  return typeof value === 'string' && value.trim().length > 0
    ? { ok: value }
    : { invalidInput: 'organization name must be a non-blank string' }
}
