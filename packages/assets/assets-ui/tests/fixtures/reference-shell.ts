import { serverPointsContract } from '@omne-harness/client-assembly'
import { servePoint, startShell as startBare } from '@omne-harness/shell-contract/testing'
import { fakeKeys } from './server-keys.ts'

export { ReferenceShell, render } from '@omne-harness/shell-contract/testing'

/** The reference shell on a tree with a connection: its server tells no point until the case sets one. */
export async function startShell() {
  const started = await startBare()
  const keys = fakeKeys()
  await servePoint(started.root, serverPointsContract, keys.source)
  return { ...started, keys }
}
