import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from '../../src/frontend/components/SearchBar.js'

describe('SearchBar', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('files mode shows scope options; outline mode does not', () => {
    const { rerender } = render(<SearchBar mode="files" onSearch={() => {}} />)
    expect(screen.getByText(/all files/i)).toBeInTheDocument()

    rerender(<SearchBar mode="outline" onSearch={() => {}} />)
    expect(screen.queryByText(/all files/i)).not.toBeInTheDocument()
  })

  it('calls onSearch with the query and default options when typing (debounced)', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(<SearchBar mode="files" onSearch={onSearch} />)

    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'hello' } })
    expect(onSearch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenCalledWith('hello', { target: 'both', scope: 'all', regex: false })
  })

  it('toggles regex mode', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(<SearchBar mode="files" onSearch={onSearch} />)
    fireEvent.click(screen.getByRole('button', { name: /regex/i }))
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'a+' } })
    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenLastCalledWith(
      'a+',
      expect.objectContaining({ regex: true })
    )
  })

  it('outline mode uses a "Title" target label, not "Name"', () => {
    render(<SearchBar mode="outline" onSearch={() => {}} />)
    expect(screen.queryByText(/^name$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/title/i)).toBeInTheDocument()
  })

  it('files mode still uses a "Name" target label', () => {
    render(<SearchBar mode="files" onSearch={() => {}} />)
    expect(screen.getByText(/^name$/i)).toBeInTheDocument()
  })

  it('outline mode omits scope and always searches by title in the debounced call', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    render(<SearchBar mode="outline" onSearch={onSearch} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'sec' } })
    vi.advanceTimersByTime(300)
    expect(onSearch).toHaveBeenCalledWith('sec', { target: 'title', regex: false })
  })

  it('outline mode does not offer Content/Both search targets (no content available client-side)', () => {
    render(<SearchBar mode="outline" onSearch={() => {}} />)
    expect(screen.queryByText(/^content$/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/^both$/i)).not.toBeInTheDocument()
    expect(screen.getByText(/title/i)).toBeInTheDocument()
  })

  it('files mode still offers Content/Both search targets', () => {
    render(<SearchBar mode="files" onSearch={() => {}} />)
    expect(screen.getByText(/^content$/i)).toBeInTheDocument()
    expect(screen.getByText(/^both$/i)).toBeInTheDocument()
  })

  it('resets target to a mode-valid value when rerendered in place from files to outline', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    const { rerender } = render(<SearchBar mode="files" onSearch={onSearch} />)
    fireEvent.click(screen.getByText(/^content$/i))

    rerender(<SearchBar mode="outline" onSearch={onSearch} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'sec' } })
    vi.advanceTimersByTime(300)

    expect(onSearch).toHaveBeenCalledWith('sec', { target: 'title', regex: false })
  })

  it('resets target to a mode-valid value when rerendered in place from outline to files', () => {
    vi.useFakeTimers()
    const onSearch = vi.fn()
    const { rerender } = render(<SearchBar mode="outline" onSearch={onSearch} />)

    rerender(<SearchBar mode="files" onSearch={onSearch} />)
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'sec' } })
    vi.advanceTimersByTime(300)

    expect(onSearch).toHaveBeenCalledWith('sec', { target: 'both', scope: 'all', regex: false })
  })
})
