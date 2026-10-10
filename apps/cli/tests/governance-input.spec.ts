import { expect, it, vi } from 'vitest'
import { parseEntryCommand } from '../src/entry-command.ts'
import {
  completeGovernanceInput,
  type GovernanceCommand,
  type GovernanceDialog,
  type GovernanceChoices,
} from '../src/governance-input.ts'
import { checkedTenantBinding } from '../src/state-layout-values.ts'
import { tenantReference } from '../src/tenant-reference.ts'

function fixture(args: readonly string[]) {
  const parsed = parseEntryCommand(args, true)
  if (parsed.kind !== 'governance') throw new Error('wrong fixture')
  const command: GovernanceCommand = parsed
  const dialog: GovernanceDialog = {
    text: vi.fn(),
    choose: vi.fn(),
    show: vi.fn(async () => true),
    identity: vi.fn(),
  }
  const target = checkedTenantBinding({
    formatVersion: 1,
    centerId: 'a'.repeat(32),
    tenant: { organization: 'team', account: 'owner' },
  })
  const choices: GovernanceChoices = {
    centers: vi.fn(async () => [
      {
        name: 'work',
        center: {
          centerId: target.centerId,
          endpoint: 'https://center.invalid/',
          trust: { mode: 'ca' as const },
        },
      },
    ]),
    tenants: vi.fn(async () => [
      { binding: target, reference: tenantReference(target), label: '研发组 / owner / member' },
    ]),
    invitations: vi.fn(async () => [
      { id: 'invitation', label: '研发组 / issued by team / expires 2026-10-08T20:00:00Z' },
    ]),
  }
  return { command, dialog, choices, target, signal: new AbortController().signal }
}
it('does not prompt or read candidates in JSON mode', async () => {
  const f = fixture(['tenant', 'create', '--name', '研发组', '--json'])
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toEqual(f.command)
  expect(f.dialog.text).not.toHaveBeenCalled()
  expect(f.dialog.show).not.toHaveBeenCalled()
  expect(f.choices.tenants).not.toHaveBeenCalled()
})
it('fills a missing organization name and confirms without altering the parsed command', async () => {
  const f = fixture(['tenant', 'create'])
  vi.mocked(f.dialog.text).mockResolvedValue('研发组')
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toMatchObject({
    values: { name: '研发组' },
  })
  expect(f.command.values).toEqual({})
  expect(f.dialog.show).toHaveBeenCalled()
})
it('picks a real scoped tenant and preserves the full reference', async () => {
  const f = fixture(['tenant', 'switch'])
  vi.mocked(f.dialog.choose).mockResolvedValue(0)
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toMatchObject({
    values: { tenant: tenantReference(f.target) },
  })
  expect(f.dialog.choose).toHaveBeenCalledWith('Select tenant', [expect.stringContaining('研发组')])
})
it('picks an actual received invitation instead of accepting an arbitrary identity', async () => {
  const f = fixture(['tenant', 'add'])
  vi.mocked(f.dialog.choose).mockResolvedValue(0)
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toMatchObject({
    values: { invitation: 'invitation' },
  })
  expect(f.choices.invitations).toHaveBeenCalledOnce()
})
it('does not create a target when there are no received invitations', async () => {
  const f = fixture(['tenant', 'add'])
  vi.mocked(f.choices.invitations).mockResolvedValue([])
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toBeUndefined()
  expect(f.dialog.choose).not.toHaveBeenCalled()
})
it('collects only a credential file path and an explicit center for login', async () => {
  const f = fixture(['login'])
  vi.mocked(f.dialog.choose).mockResolvedValue(0)
  vi.mocked(f.dialog.text)
    .mockResolvedValueOnce('owner')
    .mockResolvedValueOnce('/private/credential')
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toMatchObject({
    values: {
      center: 'work',
      'login-identifier': 'owner',
      'credential-file': '/private/credential',
    },
  })
  expect(f.dialog.text).toHaveBeenCalledWith('Credential file path', expect.any(Array))
})
it('cancels before choosing a trust source when center input is cancelled', async () => {
  const f = fixture(['center', 'add'])
  vi.mocked(f.dialog.text).mockResolvedValue(undefined)
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toBeUndefined()
  expect(f.dialog.choose).not.toHaveBeenCalled()
})
it('does not default to system trust without a choice', async () => {
  const f = fixture(['center', 'add', 'https://center.invalid/', '--name', 'work'])
  vi.mocked(f.dialog.choose).mockResolvedValue(undefined)
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toBeUndefined()
})
it('does not execute when confirmation or the original signal is cancelled', async () => {
  const f = fixture(['tenant', 'create', '--name', '研发组'])
  vi.mocked(f.dialog.show).mockResolvedValue(false)
  expect(await completeGovernanceInput(f.command, f.dialog, f.choices, f.signal)).toBeUndefined()
  const controller = new AbortController()
  controller.abort()
  expect(
    await completeGovernanceInput(f.command, f.dialog, f.choices, controller.signal),
  ).toBeUndefined()
  expect(f.dialog.show).toHaveBeenCalledTimes(1)
})
