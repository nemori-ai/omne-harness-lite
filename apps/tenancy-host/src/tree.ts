import { join } from 'node:path'
import { z } from 'zod'
import type { PluginRow } from '@omne-harness-lite/cordis-plugin-tree'
import type { HostConfig } from './config.ts'
import { HOST_VERSION } from './version.ts'

/** Network drain bound; it never replaces completion of owned business or maintenance. */
export const DRAIN_TIMEOUT_MS = 10_000
/** Diagnostic threshold only; shutdown continues waiting after this time. */
export const DISPOSE_TIMEOUT_MS = 30_000
export const SERVING_GRACE_MS = 1_000

export interface HostTreeData {
  readonly backupDirectory: string
  readonly sourceBuildId: string | null
  readonly migrationNames: readonly string[]
}

/** Distribution data only. Runtime resources belong to the host's named services. */
export function buildDistributionTree(
  config: HostConfig,
  data: HostTreeData,
): readonly PluginRow[] {
  if (config.storage.dialect !== 'sqlite')
    throw new Error(
      'tenancy-host: bounded governance currently requires SQLite; PostgreSQL composition is not supported',
    )
  return [
    {
      id: 'storage-sql',
      plugin: { package: '@omne-harness-lite/storage-sql', export: 'managedStorageSqlPlugin' },
      config: {
        dialect: 'sqlite',
        file: config.storage.file,
        synchronous: 'full',
        startup: 'migrate',
        maintenance: { workDirectory: join(data.backupDirectory, '.quarantine') },
      },
    },
    {
      id: 'clock-lease',
      plugin: { package: '@omne-harness-lite/clock-lease', export: 'managedClockPlugin' },
      config: {},
    },
    {
      id: 'credential-verification',
      plugin: {
        package: '@omne-harness-lite/credential-verification-scrypt',
        export: 'managedCredentialsPlugin',
      },
      config: {},
    },
    {
      id: 'account-identity',
      plugin: {
        package: '@omne-harness-lite/account-identity-sql',
        export: 'managedAccountIdentityPlugin',
      },
      config: {
        ...(config.credentialPolicy === undefined
          ? {}
          : { credentialPolicy: z.json().parse(config.credentialPolicy) }),
        unactivatedRetention: config.parameters.unactivatedRetention,
        activationVerificationKeyPem: config.keys.activationVerificationKeyPem,
        purgeVerificationKeyPem: config.keys.purgeVerificationKeyPem,
      },
    },
    {
      id: 'organization-governance',
      plugin: {
        package: '@omne-harness-lite/organization-governance-sql',
        export: 'managedOrganizationGovernancePlugin',
      },
      config: {
        invitationTtlDefault: config.parameters.invitationTtlDefault,
        affiliationRequestTtlDefault: config.parameters.affiliationRequestTtlDefault,
        teamCreationKeyRetention: config.teamCreationKeyRetention,
        purgeSigningKeyPem: config.keys.purgeSigningKeyPem,
      },
    },
    {
      id: 'account-registration',
      plugin: {
        package: '@omne-harness-lite/account-registration-sequential',
        export: 'managedRegistrationPlugin',
      },
      config: { activationSigningKeyPem: config.keys.activationSigningKeyPem },
    },
    {
      id: 'governance-center-ops',
      plugin: {
        package: '@omne-harness-lite/governance-center-entry-node',
        export: 'managedGovernanceCenterOpsPlugin',
      },
      config: {
        socketDirectory: config.opsSocketDirectory,
        deploymentKey: { present: true, complete: true },
        deploymentParameters: { ...config.parameters },
        maintenance: {
          backupDirectory: data.backupDirectory,
          sourceBuildId: data.sourceBuildId,
          migrationNames: [...data.migrationNames],
        },
      },
    },
    {
      id: 'governance-center-entry',
      plugin: {
        package: '@omne-harness-lite/governance-center-entry-node',
        export: 'managedGovernanceCenterEntryPlugin',
      },
      config: {
        listen: { ...config.entry.listen },
        tls: { ...config.entry.tls },
        version: HOST_VERSION,
        drainTimeoutMs: DRAIN_TIMEOUT_MS,
        clockReadyTimeoutMs: config.clockReadyTimeoutMs,
      },
    },
  ]
}
