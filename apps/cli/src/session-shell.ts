import { createShellTool } from '@omne-harness-lite/meta-shell'

/** The CLI release chooses its shell and output policy. */
export const sessionShell = createShellTool({
  shell: { executable: '/bin/bash', args: ['--noprofile', '--norc'] },
  maxOutputBytes: 65_536,
  executePermission: 'auto',
  backgroundThreshold: 'PT30S',
})

export const sessionShellAsset = Object.freeze({
  id: 'omne.cli.shell',
  capability: { category: 'tool' as const, name: 'Shell' },
  origin: 'official' as const,
  versions: [
    {
      number: 1,
      publishedAt: '2026-10-10T00:00:00Z',
      content: { category: 'tool' as const, definition: sessionShell.definition },
    },
  ],
})
