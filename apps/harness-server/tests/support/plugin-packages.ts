import type { TenantId } from '@omne-harness/legal-identity'
import type { ProtocolClients } from './protocol-clients.ts'

type Assets = ProtocolClients['assets']

/** Publishes one plugin directory through assets/v1, file by file, and answers what the commit answered. */
export const uploadPlugin = (
  assets: Assets,
  tenant: TenantId,
  name: string,
  files: Readonly<Record<string, string>>,
  operation = `up-${name}`,
) => uploadAsset(assets, tenant, 'plugin', name, files, operation)

/** Publishes one directory of a category through assets/v1, file by file. */
export async function uploadAsset(
  assets: Assets,
  tenant: TenantId,
  category: string,
  name: string,
  files: Readonly<Record<string, string>>,
  operation = `up-${category}-${name}`,
) {
  const encoder = new TextEncoder()
  const begun = await assets['begin-asset-upload']({
    tenant,
    operation,
    category,
    name,
    manifest: Object.entries(files).map(([path, text]) => ({
      path,
      bytes: encoder.encode(text).length,
    })),
  })
  if (begun.outcome !== 'succeeded') throw new Error(`begin: ${JSON.stringify(begun)}`)
  for (const [path, text] of Object.entries(files)) {
    const sent = await assets['append-asset-upload']({
      tenant,
      upload: operation,
      path,
      offset: 0,
      bytes: encoder.encode(text),
    })
    if (sent.outcome !== 'succeeded') throw new Error(`append ${path}: ${sent.outcome}`)
  }
  return assets['commit-asset-upload']({ tenant, upload: operation })
}
