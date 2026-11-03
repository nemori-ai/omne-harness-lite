import { expect, it } from 'vitest'
import { originRef, type FacilityRequest } from '@omne-harness/execution-environment-contract'
import {
  createMemoryFileSystem,
  createScriptedCommandFacility,
} from '@omne-harness/execution-environment-contract/testing'
import {
  createFilesAuthor,
  createShellAuthor,
  type FilesAuthorEnvironment,
  type ShellAuthorEnvironment,
} from '@omne-harness/tool-definitions'
import { filesFixture } from './fixtures/files.ts'
import { shellFixture } from './fixtures/shell.ts'
import { run, value } from './run-author.ts'

it('consumes the existing memory files and scripted command through request-binding fixtures', async () => {
  let sequence = 0
  const request = (): FacilityRequest<string> => ({
    requestId: `request-${++sequence}`,
    origin: originRef('fixture-origin'),
    binding: { kind: 'host_machine' },
    access: {
      principal: 'fixture',
      tenant: {
        name: 'TenantId',
        organization: { name: 'OrganizationId', text: 'org_fixture' },
        account: { name: 'AccountId', text: 'acc_fixture' },
      },
    },
  })
  const memory = createMemoryFileSystem<string>({ files: { 'docs/note.txt': '中文\r\nold\r\n末' } })
  const fallback = filesFixture()
  const environment: FilesAuthorEnvironment = {
    files: {
      ...fallback.environment.files,
      read: args =>
        memory.facility.read({
          ...request(),
          ...args,
          named: memory.objectToken(args.path) ?? null,
        }),
      stat: args =>
        memory.facility.stat({
          ...request(),
          ...args,
          named: memory.objectToken(args.path) ?? null,
        }),
      write: args =>
        memory.facility.write({
          ...request(),
          ...args,
          named: memory.objectToken(args.path) ?? null,
        }),
      list: args =>
        memory.facility.list({
          ...request(),
          ...args,
          named: memory.objectToken(args.path) ?? null,
        }),
    },
  }
  const files = value(createFilesAuthor(fallback.config))
  expect(
    await run(
      files,
      'edit',
      { path: 'docs/note.txt', old_text: 'old', new_text: 'new' },
      environment,
    ),
  ).toContain('done')
  expect(new TextDecoder().decode(memory.peek('docs/note.txt'))).toBe('中文\r\nnew\r\n末')
  const listed = await memory.facility.list({
    ...request(),
    path: 'docs',
    named: memory.objectToken('docs') ?? null,
  })
  if (listed.kind !== 'done') throw new Error('memory directory listing failed')
  expect(listed.value.entries).toHaveLength(1)
  const named = listed.value.entries.every(
    entry => 'name' in entry && typeof entry.name === 'string',
  )
  const listing = await run(files, 'list', { path: 'docs' }, environment)
  if (named) expect(listing).toContain('note.txt')
  else {
    expect(listing).toMatch(/^unavailable/)
    expect(listing).toContain('entry-name-unavailable')
    expect(listing).not.toContain('note.txt')
  }
  const scripted = createScriptedCommandFacility<string>(() => ({
    kind: 'started',
    output: [
      { stream: 'stdout', data: new Uint8Array([0xe4]) },
      { stream: 'stdout', data: new Uint8Array([0xb8, 0xad]) },
    ],
  }))
  const shell = shellFixture()
  const shellEnvironment: ShellAuthorEnvironment = {
    ...shell.environment,
    command: { start: args => scripted.facility.start({ ...request(), ...args }) },
  }
  expect(
    await run(
      value(createShellAuthor(shell.config)),
      'execute',
      { script: 'fixture' },
      shellEnvironment,
    ),
  ).toContain('中')
  expect(scripted.calls[0]?.args).toEqual(['-c', 'fixture'])
  expect(scripted.calls[0]?.origin).toBe('fixture-origin')
  memory.close()
  scripted.close()
})
