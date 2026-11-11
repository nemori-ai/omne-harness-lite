import type { z } from 'zod'
import type { SettingsTarget } from '@omne-harness/settings'
import type { StorageScope } from '@omne-harness/sql-contract'
import type { accessGrantSchema, OperationBinding } from './schema.ts'

export type SettingsSqlOperationBinding = OperationBinding
/** The scope and the target that an access decision is for. */
export type SettingsSqlAccessRequest = Readonly<{ scope: StorageScope; target: SettingsTarget }>
export type SettingsSqlAccessGrant = z.infer<typeof accessGrantSchema>
