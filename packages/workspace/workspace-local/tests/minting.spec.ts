import { describe, expect, it } from 'vitest'
import { workspaceCodec } from '@omne-harness/legal-identity'
import { instanceId } from '@omne-harness/workspace-contract'
import { createMinting } from '@omne-harness/workspace-local'

describe('minted identities', () => {
  it('parse as what they are and do not repeat', () => {
    const minting = createMinting()
    const workspaces = Array.from({ length: 200 }, () => minting.workspace())
    const instances = Array.from({ length: 200 }, () => minting.instance())
    for (const workspace of workspaces) expect(workspaceCodec.encode(workspace).ok).toBe(true)
    for (const instance of instances) expect(instanceId(instance)).toBe(instance)
    expect(new Set(workspaces.map(workspace => workspace.text)).size).toBe(200)
    expect(new Set(instances).size).toBe(200)
    expect(new Set(instances.join('').replaceAll('wsi_', '')).size).toBeGreaterThan(20)
  })
})
