// PermissionScope is owned by @omne-harness-lite/authorization, not this package.
// @ts-expect-error The tenant public entry must not export PermissionScope.
import type { PermissionScope } from '@omne-harness-lite/tenant'

declare const permissionScope: PermissionScope
void permissionScope
