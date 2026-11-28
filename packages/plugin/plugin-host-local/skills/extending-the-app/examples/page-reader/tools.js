// One tool for the agent, reader__read. It reaches outside only through the port web.
export function tools() {
  return {
    tools: {
      read: {
        summary: 'Reads the text of the page at an address.',
        params: {
          type: 'object',
          properties: { url: { type: 'string', description: 'An http or https address.' } },
          required: ['url'],
        },
        effect: 'read',
        async run(input, { ports }) {
          const answer = await ports.web.fetch({ url: input.url })
          if (answer.outcome !== 'done') return answer
          const { finalUrl, text, truncated } = answer.value
          return { url: finalUrl, text, truncated }
        },
      },
    },
  }
}
