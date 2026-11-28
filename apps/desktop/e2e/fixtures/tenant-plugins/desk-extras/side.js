export const item = ({ React }) => ({
  id: 'desk-extras.notes',
  label: 'Extras',
  order: 50,
  anchor: 'session.side',
  render: () =>
    React.createElement(
      'div',
      { 'data-omne-part': 'desk-extras.panel' },
      'Extras for this conversation',
    ),
})
