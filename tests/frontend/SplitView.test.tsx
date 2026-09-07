import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SplitView } from '../../src/frontend/components/SplitView.js'

describe('SplitView', () => {
  it('renders both an editable textarea and a live markdown preview', () => {
    render(<SplitView value="# Title" onChange={() => {}} onSave={() => {}} blockRemoteContent={false} />)
    expect(screen.getByRole('textbox')).toHaveValue('# Title')
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument()
  })

  it('propagates onChange from the editor side', () => {
    const onChange = vi.fn()
    render(<SplitView value="# Title" onChange={onChange} onSave={() => {}} blockRemoteContent={false} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# New Title' } })
    expect(onChange).toHaveBeenCalledWith('# New Title')
  })

  it('passes blockRemoteContent through to its preview pane', () => {
    render(
      <SplitView
        value="![cat](https://tracker.example.com/cat.png)"
        onChange={() => {}}
        onSave={() => {}}
        blockRemoteContent={true}
      />
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByTestId('blocked-remote-content')).toBeInTheDocument()
  })
})
