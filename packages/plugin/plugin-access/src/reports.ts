import type { ClientReport, PluginReports } from './ports.ts'

/** Reports kept in this process: lost with it, and given again by each client when it loads again. */
export function createPluginReports(kept: Readonly<{ perTenant: number }>): PluginReports {
  const byTenant = new Map<string, Map<string, ClientReport>>()
  const there = new Map<string, number>()
  const keyOf = (tenant: string, client: string): string => `${tenant}\n${client}`
  const drop = (tenant: string, client: string): void => {
    const clients = byTenant.get(tenant)
    if (clients === undefined) return
    clients.delete(client)
    if (clients.size === 0) byTenant.delete(tenant)
  }
  return {
    record(tenant, client, report) {
      if (!there.has(keyOf(tenant, client))) return 'absent'
      const clients = byTenant.get(tenant) ?? new Map<string, ClientReport>()
      clients.delete(client)
      clients.set(client, structuredClone(report))
      byTenant.set(tenant, clients)
      for (const oldest of clients.keys()) {
        if (clients.size <= kept.perTenant) break
        clients.delete(oldest)
      }
      return 'kept'
    },
    present(tenant, client) {
      const key = keyOf(tenant, client)
      there.set(key, (there.get(key) ?? 0) + 1)
      let left = false
      return () => {
        if (left) return
        left = true
        const rest = (there.get(key) ?? 1) - 1
        if (rest > 0) return void there.set(key, rest)
        there.delete(key)
        drop(tenant, client)
      }
    },
    reportsOf(tenant) {
      return [...(byTenant.get(tenant) ?? [])]
        .map(([client, report]) => ({ client, ...structuredClone(report) }))
        .sort((left, right) => (left.client < right.client ? -1 : 1))
    },
  }
}
