// The release Web definition, derived as `tool-host` derives it after it loaded the author.
import type { ToolDefinition } from '@omne-harness/tool-contract'
import { deriveDefinition, judgeToolDefinition } from '@omne-harness/tool-contract/provider'
import { loadProductionRelease } from '../../src/entry/tool-release.ts'
import { governanceOf } from '../../src/entry/tool-release-manifest.ts'
import { TEST_CONSTRUCTION, tree } from '../rows/tool-host/support.ts'

export async function releaseWebDefinition(): Promise<ToolDefinition> {
  const snapshot = await loadProductionRelease()
  if (snapshot.kind !== 'trusted') throw new Error(`release ${snapshot.diagnostic}`)
  const entry = snapshot.manifest.entries.find(candidate => candidate.asset.name === 'Web')
  if (entry === undefined) throw new Error('the release has no Web entry')
  const author = snapshot.modules.webToolModule.createAuthor(tree(TEST_CONSTRUCTION.Web))
  if ('failure' in author) throw new Error('fixture: Web author')
  const definition = judgeToolDefinition(deriveDefinition(governanceOf(entry), author.ok.facts))
  if ('failure' in definition) throw new Error('fixture: Web definition')
  return definition.ok
}
