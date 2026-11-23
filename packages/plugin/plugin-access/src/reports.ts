import type { LoadReport, PluginReports } from './ports.ts'

export type ClientReports = Readonly<{ client: string; plugins: readonly LoadReport[] }>

export type PluginReportsInMemory = PluginReports & {
  /** What each client of the tenant reported last, by client. */
  reportsOf(tenant: string): readonly ClientReports[]
}

/** Reports kept in this process: lost with it, and given again by each client when it loads again. */
export function createPluginReports(): PluginReportsInMemory {
  const byTenant = new Map<string, Map<string, readonly LoadReport[]>>()
  return {
    record(tenant, client, reports) {
      const clients = byTenant.get(tenant) ?? new Map<string, readonly LoadReport[]>()
      clients.set(client, [...reports])
      byTenant.set(tenant, clients)
    },
    forget(tenant, client) {
      const clients = byTenant.get(tenant)
      clients?.delete(client)
      if (clients?.size === 0) byTenant.delete(tenant)
    },
    reportsOf(tenant) {
      const clients = byTenant.get(tenant) ?? new Map<string, readonly LoadReport[]>()
      return [...clients]
        .map(([client, plugins]) => ({ client, plugins }))
        .sort((left, right) => (left.client < right.client ? -1 : 1))
    },
  }
}
