import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopBar } from '../../src/frontend/components/TopBar.js'

describe('TopBar', () => {
  it('renders fullscreen, show-path, and print buttons in that order', () => {
    render(<TopBar onOpenSettings={() => {}} onFullscreen={() => {}} onShowPath={() => {}} onPrint={() => {}} />)
    const buttons = screen.getAllByRole('button')
    const labels = buttons.map((b) => b.getAttribute('aria-label'))
    const fsIndex = labels.findIndex((l) => /fullscreen/i.test(l ?? ''))
    const pathIndex = labels.findIndex((l) => /show path|path/i.test(l ?? ''))
    const printIndex = labels.findIndex((l) => /print/i.test(l ?? ''))
    expect(fsIndex).toBeGreaterThanOrEqual(0)
    expect(pathIndex).toBeGreaterThan(fsIndex)
    expect(printIndex).toBeGreaterThan(pathIndex)
  })

  it('calls onFullscreen/onShowPath/onPrint when clicked', () => {
    const onFullscreen = vi.fn()
    const onShowPath = vi.fn()
    const onPrint = vi.fn()
    render(
      <TopBar
        onOpenSettings={() => {}}
        onFullscreen={onFullscreen}
        onShowPath={onShowPath}
        onPrint={onPrint}
      />
    )
    fireEvent.click(screen.getByLabelText(/fullscreen/i))
    fireEvent.click(screen.getByLabelText(/show path|^path$/i))
    fireEvent.click(screen.getByLabelText(/print/i))
    expect(onFullscreen).toHaveBeenCalledOnce()
    expect(onShowPath).toHaveBeenCalledOnce()
    expect(onPrint).toHaveBeenCalledOnce()
  })

  it('shows an update hint when updateAvailable is provided', () => {
    render(
      <TopBar
        onOpenSettings={() => {}}
        onFullscreen={() => {}}
        onShowPath={() => {}}
        onPrint={() => {}}
        updateAvailable={{ latestVersion: '9.9.9' }}
      />
    )
    expect(screen.getByText(/9\.9\.9/)).toBeInTheDocument()
  })

  it('shows nothing when updateAvailable is null/undefined', () => {
    render(<TopBar onOpenSettings={() => {}} onFullscreen={() => {}} onShowPath={() => {}} onPrint={() => {}} />)
    expect(screen.queryByText(/update available/i)).not.toBeInTheDocument()
  })
})
