import { createMcp as realCreateMcp, createInMemoryCatalogStore } from '@omne-harness/mcp'
export { createInMemoryCatalogStore }
export const probe = { delayMs: 0, reject: undefined, settledAt: undefined }
export function createMcp(ports, config) {
  const services = realCreateMcp(ports, config)
  const closeAll = async () => {
    const report = await services.connections.closeAll()
    await new Promise(r => setTimeout(r, probe.delayMs))
    probe.settledAt = Date.now()
    if (probe.reject) throw probe.reject
    return report
  }
  return { ...services, connections: { ...services.connections, closeAll } }
}
