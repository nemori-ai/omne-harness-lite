const acting = new WeakMap<object, string>()

/** Remembers the tenant a principal the entry was issued acts for: only the entry's own operations read it. */
export function issuedFor(principal: unknown, tenant: string): void {
  if (typeof principal === 'object' && principal !== null) acting.set(principal, tenant)
}

export const tenantActedFor = (principal: unknown): string | undefined =>
  typeof principal === 'object' && principal !== null ? acting.get(principal) : undefined
