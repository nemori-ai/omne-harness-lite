import { expect, it } from 'vitest'

it('the public entry is the prompt command category and its entry source', async () => {
  const root = (await import('@omne-harness/prompt-command-source')) as Record<string, unknown>
  expect(Object.keys(root).sort()).toEqual([
    'PROMPT_CATEGORY',
    'PROMPT_FILE',
    'PROMPT_SPACE',
    'createPromptEntrySource',
    'heldPrompts',
    'onePrompt',
    'promptBodyContract',
    'promptCategoryDisplay',
    'promptCommandsPoint',
    'promptLayout',
    'promptOf',
    'promptProblem',
  ])
})
