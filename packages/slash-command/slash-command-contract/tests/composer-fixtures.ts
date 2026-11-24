import {
  type Catalog,
  type CommandEntry,
  type Composer,
  known,
  start,
  typed,
} from '@omne-harness/slash-command-contract'

const skill = (name: string, unavailable?: string): CommandEntry => ({
  space: 'skill',
  name,
  kind: 'reference',
  title: `${name} 的说明`,
  ...(unavailable === undefined ? {} : { unavailable }),
})
export const CATALOG: Catalog = {
  entries: [
    skill('review'),
    skill('release'),
    skill('old', '停用了'),
    { space: 'prompt', name: 'commit', kind: 'prompt', title: '写提交说明' },
    { space: 'omne-official', name: 'archive', kind: 'system', title: '归档' },
  ],
  missing: [],
}
export const at = (text: string, caret = text.length, catalog = CATALOG): Composer =>
  typed(start(known(catalog)), text, caret)
