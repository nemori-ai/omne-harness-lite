// PACKAGE_TEMPLATE_DRAFT: parse, encode, and tenant() stay with issue #243.

/** Identity type names for static checks. Login identifiers are account attributes, not identity types. */
export const IDENTITY_TYPE_NAMES = Object.freeze([
  'AccountId',
  'OrganizationId',
  'LoginStateId',
  'TenantId',
  'ScopeLayerIdentity',
] as const)
