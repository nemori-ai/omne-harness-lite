const RETRY_MS = 2000

export function page({ React, ports }) {
  const notes = ports['notes/v1']
  function Notes() {
    const [listed, setListed] = React.useState(undefined)
    React.useEffect(() => {
      let live = true
      let timer
      const ask = async () => {
        const answer = await notes.list({})
        if (!live) return
        if (answer.outcome === 'succeeded') setListed(answer.body.notes)
        else timer = setTimeout(ask, RETRY_MS)
      }
      void ask()
      return () => {
        live = false
        clearTimeout(timer)
      }
    }, [])
    if (listed === undefined)
      return React.createElement('p', null, 'Waiting for the server side of this plugin.')
    return React.createElement(
      'ul',
      null,
      listed.map(note => React.createElement('li', { key: note }, note)),
    )
  }
  return { title: 'Notes', order: 60, icon: 'file', render: () => React.createElement(Notes) }
}
