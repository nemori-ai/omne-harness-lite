export const hello = () => ({
  id: 'desk-extras.hello',
  title: 'Say hello from the extras',
  group: 'desk-extras',
  kind: 'command',
  order: 50,
  available: () => true,
  run: () => document.body.setAttribute('data-desk-extras', 'hello'),
})
