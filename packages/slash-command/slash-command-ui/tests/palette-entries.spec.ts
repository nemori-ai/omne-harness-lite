import { Context } from '@deepseek-ai/cordis'
import {
  slashCommandProtocol,
  type SlashCommandCatalog,
} from '@omne-harness/slash-command-protocol'
import { createComposer } from '@omne-harness/slash-command-contract'
import { serviceKey, type ActionItem } from '@omne-harness/shell-contract'
import {
  provideOn,
  providedOn,
  serveProtocol,
  startShell,
} from '@omne-harness/shell-contract/testing'
import {
  type ComposerWriter,
  createSlashCommandUiModule,
  slashCommandComposerKey,
} from '@omne-harness/slash-command-ui/cordis'
import { describe, expect, it, vi } from 'vitest'

const TENANT =
  '{"organization":"org_00000000000000000000000000","account":"acc_00000000000000000000000001"}'

const CATALOG: SlashCommandCatalog = {
  entries: [
    {
      full: 'system:archive',
      space: 'system',
      name: 'archive',
      kind: 'system',
      title: '归档这段会话',
    },
    {
      full: 'system:model',
      space: 'system',
      name: 'model',
      kind: 'system',
      title: '换模型',
      hint: '<模型名>',
    },
    {
      full: 'skill:review',
      space: 'skill',
      name: 'review',
      kind: 'reference',
      title: '评审',
      unavailable: '停用了',
    },
  ],
  missing: [],
}

const writerKey = serviceKey<ComposerWriter>('test.writer')

async function opened(stopRan: string[] = []) {
  const { root, shell } = await startShell()
  const said: string[] = []
  const written: string[] = []
  const client = {
    'read-catalog': async () => ({ outcome: 'succeeded', body: CATALOG }),
    observe: { 'observe-catalog': async function* () {} },
  }
  await serveProtocol(root, slashCommandProtocol, client)
  await provideOn(root, writerKey, {
    write: text => (written.push(text), true),
    say: text => (said.push(text), true),
  })
  root.plugin({
    name: 'controls',
    inject: ['shell'],
    apply: (ctx: Context) => {
      const control = (id: string, layer: 'global' | 'composer'): ActionItem => ({
        id,
        title: id,
        group: 'g',
        kind: 'control',
        order: 0,
        keys: [{ chord: 'Mod+.', layer }],
        available: () => (id === 'session.retry' ? '没有可以重试的一轮' : true),
        run: () => void stopRan.push(id),
      })
      ctx.shell.contribute('actions', control('session.stop', 'global'))
      ctx.shell.contribute('actions', control('session.retry', 'global'))
      ctx.shell.contribute('actions', control('session.send', 'composer'))
    },
  })
  await root.plugin(createSlashCommandUiModule({ composer: createComposer, writer: writerKey }))
  const helper = providedOn(shell, slashCommandComposerKey)!.open(TENANT, 'ses_a')
  await vi.waitFor(() => expect(shell.items('actions').some(a => a.kind === 'command')).toBe(true))
  const entry = (id: string) => shell.items('actions').find(a => a.id === id)!
  return { shell, helper, said, written, entry }
}

describe('the list of the session on show, in the action table (C15)', () => {
  it('puts each entry with its slash form; a system command that takes nothing runs, the rest are written in', async () => {
    const { said, written, entry } = await opened()
    expect(entry('slash-command.system:archive')).toMatchObject({
      kind: 'command',
      slash: '/archive',
    })
    entry('slash-command.system:archive').run()
    expect(said).toEqual(['/archive'])
    entry('slash-command.system:model').run()
    expect(written).toEqual(['/model '])
    expect(entry('slash-command.skill:review').available()).toBe('停用了')
  })

  it('takes the entries out with the composer that showed them', async () => {
    const { shell, helper } = await opened()
    helper.close()
    expect(shell.items('actions').filter(a => a.kind === 'command')).toEqual([])
  })
})

describe('a control or an action typed whole (C15)', () => {
  it('/stop runs where it is typed and empties the composer; nothing is sent', async () => {
    const ran: string[] = []
    const { helper } = await opened(ran)
    helper.input('/stop', 5)
    expect(helper.key('enter')).toEqual({ kind: 'edit', text: '', caret: 0 })
    await vi.waitFor(() => expect(ran).toEqual(['session.stop']))
  })

  it('one that cannot run now stays, and an action on the composer words or a word that is no action goes on as typed', async () => {
    const ran: string[] = []
    const { helper, shell } = await opened(ran)
    const toast = vi.spyOn(shell, 'toast')
    helper.input('/retry', 6)
    expect(helper.key('enter')).toEqual({ kind: 'held' })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: '没有可以重试的一轮' }))
    helper.input('/send', 5)
    expect(helper.key('enter')).not.toEqual({ kind: 'edit', text: '', caret: 0 })
    helper.input('/stop now', 9)
    expect(helper.key('enter')).not.toEqual({ kind: 'edit', text: '', caret: 0 })
    expect(ran).toEqual([])
  })
})
