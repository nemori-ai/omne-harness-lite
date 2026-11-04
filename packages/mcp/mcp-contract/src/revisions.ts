// The protocol revisions that the transport clauses name (SPEC T3).

/**
 * The first revision of the modern era. A revision is modern when its date is not earlier, as the
 * official TypeScript SDK 2.4.0 decides it (`isModernProtocolVersion` in `protocolEras.ts`).
 */
export const FIRST_MODERN_PROTOCOL_VERSION = '2026-07-28'

/** True for a revision of the modern era. Revision names are ISO dates, so text order is date order. */
export function isModernProtocolVersion(version: string): boolean {
  return version >= FIRST_MODERN_PROTOCOL_VERSION
}

/**
 * The legacy revisions that a transport accepts in the `initialize` answer, highest first. The
 * legacy path offers the first one. The list is `SUPPORTED_PROTOCOL_VERSIONS` of the official
 * TypeScript SDK 2.4.0 (`@modelcontextprotocol/core`, `src/constants.ts`).
 */
export const LEGACY_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
] as const

/** True when a legacy `initialize` answer names a revision that the contract supports. */
export function isLegacyProtocolVersion(
  version: string,
): version is (typeof LEGACY_PROTOCOL_VERSIONS)[number] {
  return LEGACY_PROTOCOL_VERSIONS.some(known => known === version)
}
