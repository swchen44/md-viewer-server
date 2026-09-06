import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsModal } from '../../src/frontend/components/SettingsModal.js'

describe('SettingsModal', () => {
  it('renders nothing when open is false', () => {
    render(<SettingsModal open={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the three category tabs when open', () => {
    render(<SettingsModal open={true} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
    expect(screen.getByText('Appearance')).toBeInTheDocument()
    expect(screen.getByText('Custom CSS')).toBeInTheDocument()
  })

  it('defaults to the General category content', () => {
    render(<SettingsModal open={true} onClose={() => {}} />)
    expect(screen.getByTestId('settings-tab-content')).toBeInTheDocument()
  })

  it('switching category tabs swaps the content area', () => {
    render(<SettingsModal open={true} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Appearance'))
    // content area still present after switching (real content arrives in Task 7)
    expect(screen.getByTestId('settings-tab-content')).toBeInTheDocument()
  })

  it('calls onClose when the close control is activated', () => {
    const onClose = vi.fn()
    render(<SettingsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
