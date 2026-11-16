export const FIRST_MODERN_PROTOCOL_VERSION = '2026-07-28'

export function isModernProtocolVersion(version: string): boolean {
  return version >= FIRST_MODERN_PROTOCOL_VERSION
}

export const LEGACY_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
] as const

export function isLegacyProtocolVersion(
  version: string,
): version is (typeof LEGACY_PROTOCOL_VERSIONS)[number] {
  return LEGACY_PROTOCOL_VERSIONS.some(known => known === version)
}
