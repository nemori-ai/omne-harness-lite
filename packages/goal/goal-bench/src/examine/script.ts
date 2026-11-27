import type { ExamCase, Files, Truth } from './product.ts'

export const EXAMINERS = ['real', 'truthful', 'lenient'] as const
/** Who examines: the real examining side, or one of the two that prove the gauge: it says the truth, or it says everything holds. */
export type ExaminerKind = (typeof EXAMINERS)[number]

export const BRIEF = 'Batch: examine/'
const EDIT = 'bench-edit'
const SAID = '好了。'

type Call = Readonly<{ id: string; tool: string; arguments: object }>
type When = Readonly<{ has?: readonly string[]; lacks?: readonly string[] }>
type ScriptStep = Readonly<{ when: When; say?: string; call?: readonly Call[] }>
export type ModelScript = Readonly<{ steps: readonly ScriptStep[]; provider: readonly When[] }>

const editId = (step: number, index: number): string => `${EDIT}-${String(step)}-${String(index)}`

/** The calls by which the working side writes the files of one step; the last of them is where the batch after it stands. */
function writes(step: number, files: Files): readonly Call[] {
  return Object.entries(files).map(([path, text], index) => ({
    id: editId(step, index),
    tool: 'Files',
    arguments: { command: 'write', intent: 'write', params: { path, mode: 'replace', text } },
  }))
}

/** The batch the examiner is handed at a step: the first stands where nothing was written, a later one at the last write before it. */
export function batchOf(entry: ExamCase, step: number): string {
  const written = step === 0 ? [] : Object.keys(entry.steps[step]?.write ?? {})
  return `examine/1/1/${written.length === 0 ? '' : editId(step, written.length - 1)}`
}

function pretended(entry: ExamCase, step: number, lenient: boolean): readonly ScriptStep[] {
  const batch = batchOf(entry, step)
  const look = `x-look-${String(step)}`
  const hand = `x-hand-${String(step)}`
  const truth: Readonly<Record<string, Truth>> = entry.steps[step]?.truth ?? {}
  const readings = Object.entries(truth).map(([criterion, value]) => ({
    criterion,
    value: lenient ? 'holds' : value,
    refs: [look],
    note: lenient ? '看着没问题' : `量具自检：${value}`,
  }))
  const shell = { command: 'execute', intent: 'look', params: { script: 'ls' } }
  const submit = { command: 'submit', params: { batch, readings } }
  return [
    {
      when: { has: [`Batch: ${batch}`], lacks: [look] },
      call: [{ id: look, tool: 'Shell', arguments: shell }],
    },
    {
      when: { has: [`Batch: ${batch}`, look], lacks: [hand] },
      call: [{ id: hand, tool: 'Goal', arguments: submit }],
    },
  ]
}

/** The model of one case up to a step: the working side is scripted and writes the files of that step once; the examining side is the provider's model, or scripted too. */
export function modelScript(entry: ExamCase, upTo: number, examiner: ExaminerKind): ModelScript {
  const indexes = entry.steps.map((_, index) => index).filter(index => index <= upTo)
  const examining =
    examiner === 'real'
      ? []
      : [
          ...indexes.toReversed().flatMap(step => pretended(entry, step, examiner === 'lenient')),
          { when: { has: [BRIEF] }, say: '交了。' },
        ]
  const edits = indexes
    .filter(step => step > 0)
    .map((step): ScriptStep => ({
      when: { lacks: [BRIEF, editId(step, 0)] },
      call: writes(step, entry.steps[step]?.write ?? {}),
    }))
  return {
    steps: [...examining, ...edits, { when: {}, say: SAID }],
    provider: examiner === 'real' ? [{ has: [BRIEF] }] : [],
  }
}
