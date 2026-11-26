/** The attribute a drawn element carries its part's name in: the same on every surface. */
export const PART_ATTRIBUTE = 'data-omne-part'

export const FIGURE_PART = 'shell.figure'
export const FIGURE_LABEL_PART = 'shell.figure.label'
export const FIGURE_NOTE_PART = 'shell.figure.note'
export const FIGURE_TOLD_PART = 'shell.figure.told'
export const FIGURE_FRAME_PART = 'shell.figure.frame'

export const partOf = (name: string): Readonly<{ [PART_ATTRIBUTE]: string }> => ({
  [PART_ATTRIBUTE]: name,
})
