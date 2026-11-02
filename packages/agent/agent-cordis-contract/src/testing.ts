// The `./testing` entry: a non-durable double of `AgentInstanceProvision` and the conformance suite
// that a provider of it passes. The suite returns a list of cases and does not depend on a test
// framework. A case fails with a `node:assert` AssertionError. A case that needs a fixture control
// the fixture lacks carries `uncovered` and rejects: it is reported, never passed. The double
// declares `durability: 'none'` and must not be assembled into production. It does not import
// Cordis, `agent` or `agent-host-local`, and it does not prove the host plugin, the real
// directory or any behavior across processes.
export {
  createMemoryInstanceProvision,
  type MemoryInstanceProvision,
  type MemoryInstanceProvisionInput,
  type ProvisionOperation,
} from './testing-provision.ts'
export {
  agentInstanceProvisionConformance,
  type AgentInstanceProvisionCase,
  type AgentInstanceProvisionFixture,
} from './testing-provision-conformance.ts'
export type { AgentInstanceProvision, AgentInstanceSlotInput } from './index.ts'
