export function TopBar() {
  return (
    <header
      data-testid="top-bar"
      style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}
    >
      <span>MD Viewer Server</span>
      <div>{/* language/theme/settings buttons: later tasks */}</div>
    </header>
  )
}
