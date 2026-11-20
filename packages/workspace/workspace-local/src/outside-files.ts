import {
  evaluateSettings,
  SettingDefinitionsSchema,
  type SettingDefinitions,
} from '@omne-harness/settings'

/** Whether an agent in a session with a workspace may read, or read and write, files outside it. */
export type OutsideFiles = 'none' | 'read' | 'read-write'

const VALUES: readonly OutsideFiles[] = ['none', 'read', 'read-write']

export const workspaceOutsideFilesItems = { access: 'access' } as const

export const workspaceOutsideFilesSettings: SettingDefinitions = SettingDefinitionsSchema.parse({
  providerId: 'workspace',
  definitionId: 'outside-files',
  version: '1',
  groups: [
    {
      id: 'outside-files',
      parentId: null,
      title: '工作区之外的文件',
      description: '会话选了工作区时，agent 能不能碰工作区目录之外的文件。',
      order: 0,
    },
  ],
  items: [
    {
      id: workspaceOutsideFilesItems.access,
      groupId: 'outside-files',
      category: 'placement-identity',
      presentation: {
        title: '工作区之外的文件',
        description:
          '管的是文件工具：读、查看、列出、搜索按「读」判，写入、删除、建目录按「写」判，移动与复制的源按读、目标按写。命令只在启动之前核它的起始目录和脚本里明着写出的路径，程序运行起来自己去读写的地方核不到。没选工作区的会话不看这一项。',
        impact: '之后受理的调用照新值算能碰到哪里；已经受理的调用照受理时的值。',
        clear: '回到默认：都不许。',
        adoption: 'next-read',
        enumLabels: [
          {
            value: 'none',
            title: '都不许',
            description: '读与写都只在工作区目录里。',
          },
          {
            value: 'read',
            title: '许读',
            description: '可以读工作区之外的文件；写只在工作区目录里。',
          },
          {
            value: 'read-write',
            title: '许读写',
            description: '工作区之外的文件也可以读和写。',
          },
        ],
      },
      valueSchema: { type: 'string', enum: VALUES },
      default: { kind: 'value', value: 'none' },
      merge: 'override',
      sensitivity: 'ordinary',
    },
  ],
})

type View = Readonly<{ definition: unknown; state: Readonly<{ sources: unknown }> }>

function onlyView(basis: unknown): View | null {
  const views = (basis as { views?: unknown } | null)?.views
  return Array.isArray(views) && views.length === 1 ? (views[0] as View) : null
}

/** The value a settings read gives. Null: the read does not carry a value of it. */
export function outsideFilesOf(basis: unknown): OutsideFiles | null {
  const view = onlyView(basis)
  if (view === null) return null
  const evaluated = evaluateSettings({ definition: view.definition, sources: view.state?.sources })
  if (evaluated.kind !== 'complete') return null
  const entry = evaluated.entries.find(item => item.itemId === workspaceOutsideFilesItems.access)
  const value = entry?.value.kind === 'value' ? entry.value.value : undefined
  return VALUES.find(known => known === value) ?? null
}
