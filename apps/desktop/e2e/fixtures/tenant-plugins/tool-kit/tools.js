export function tools() {
  return {
    tools: {
      echo: {
        summary: 'Echoes a text.',
        params: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        effect: 'read',
        run: async input => ({ text: input.text }),
      },
    },
  }
}
