import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type FileRequest,
  type ObjectToken,
} from '@omne-harness/execution-environment-contract'
import { createHostFilesEngine, hostObjectToken } from '../../src/host-files.ts'

const parsed = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_0123456789abcdefghjkmnpqrs',
    account: 'acc_0123456789abcdefghjkmnpqrs',
  }),
)
if (!parsed.ok) throw new Error('tenant fixture')
const tenant = parsed.value

export function request(
  path: string,
  named: ObjectToken | null,
  requestId = 'request',
): FileRequest<string> {
  return {
    requestId,
    access: { principal: 'subject', tenant },
    origin: originRef('call'),
    binding: { kind: 'host_machine' },
    path,
    named,
  }
}

async function createFixture(limits?: Parameters<typeof createHostFilesEngine>[1]) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-winfiles-')))
  const path = join(root, '中文.txt')
  const bytes = Buffer.from('中文\r\n末行')
  await writeFile(path, bytes)
  const engine = createHostFilesEngine({ root }, limits)
  return {
    root,
    path,
    bytes,
    engine,
    files: engine.facilityFor('owner'),
    input: request(path, await hostObjectToken(path)),
  }
}

export async function withFiles(
  run: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
  limits?: Parameters<typeof createHostFilesEngine>[1],
): Promise<void> {
  const fixture = await createFixture(limits)
  try {
    await run(fixture)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
}
