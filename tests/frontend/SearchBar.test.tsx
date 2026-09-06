import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
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

  describe('search history and autocomplete', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('shows matching history suggestions as the user types', () => {
      localStorage.setItem(
        'mvs-search-history:files',
        JSON.stringify({ maxSize: 10, entries: ['hello world', 'goodbye', 'help'] })
      )
      render(<SearchBar mode="files" onSearch={() => {}} />)
      fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: 'hel' } })
      expect(screen.getByText('hello world')).toBeInTheDocument()
      expect(screen.getByText('help')).toBeInTheDocument()
      expect(screen.queryByText('goodbye')).not.toBeInTheDocument()
    })

    it('shows all history when the input is empty and focused', () => {
      localStorage.setItem(
        'mvs-search-history:files',
        JSON.stringify({ maxSize: 10, entries: ['a', 'b'] })
      )
      render(<SearchBar mode="files" onSearch={() => {}} />)
      fireEvent.focus(screen.getByPlaceholderText(/search/i))
      expect(screen.getByText('a')).toBeInTheDocument()
      expect(screen.getByText('b')).toBeInTheDocument()
    })

    it('does not render a suggestion list when there is no history', () => {
      render(<SearchBar mode="files" onSearch={() => {}} />)
      fireEvent.focus(screen.getByPlaceholderText(/search/i))
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    })

    it('pressing Enter commits the query immediately, bypassing debounce, and records history', () => {
      vi.useFakeTimers()
      const onSearch = vi.fn()
      const { unmount: unmountFirst } = render(<SearchBar mode="files" onSearch={onSearch} />)
      const input = screen.getByPlaceholderText(/search/i)
      fireEvent.change(input, { target: { value: 'my query' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onSearch).toHaveBeenCalledWith('my query', { target: 'both', scope: 'all', regex: false })
      vi.useRealTimers()
      unmountFirst()

      // history persisted for the next mount
      const { unmount } = render(<SearchBar mode="files" onSearch={() => {}} />)
      fireEvent.focus(screen.getByPlaceholderText(/search/i))
      expect(screen.getByText('my query')).toBeInTheDocument()
      unmount()
    })

    it('ArrowDown highlights a suggestion and Enter selects it', () => {
      localStorage.setItem(
        'mvs-search-history:files',
        JSON.stringify({ maxSize: 10, entries: ['alpha', 'beta'] })
      )
      const onSearch = vi.fn()
      render(<SearchBar mode="files" onSearch={onSearch} />)
      const input = screen.getByPlaceholderText(/search/i)
      fireEvent.focus(input)
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(input).toHaveValue('alpha')
      expect(onSearch).toHaveBeenCalledWith('alpha', expect.anything())
    })

    it('Tab completes the input to the highlighted suggestion without submitting or moving focus', () => {
      localStorage.setItem(
        'mvs-search-history:files',
        JSON.stringify({ maxSize: 10, entries: ['alpha', 'beta'] })
      )
      const onSearch = vi.fn()
      render(<SearchBar mode="files" onSearch={onSearch} />)
      const input = screen.getByPlaceholderText(/search/i)
      fireEvent.focus(input)
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
      // A raw dispatchEvent (rather than fireEvent.keyDown) is used here so the
      // test can inspect the native event's defaultPrevented flag directly;
      // wrapped in act() so React flushes the resulting state update before
      // the assertions below read the input's value.
      act(() => {
        input.dispatchEvent(tabEvent)
      })
      expect(input).toHaveValue('alpha')
      expect(tabEvent.defaultPrevented).toBe(true)
      expect(onSearch).not.toHaveBeenCalled()
    })

    it('Escape closes the suggestion menu without changing the input value', () => {
      localStorage.setItem(
        'mvs-search-history:files',
        JSON.stringify({ maxSize: 10, entries: ['alpha'] })
      )
      render(<SearchBar mode="files" onSearch={() => {}} />)
      const input = screen.getByPlaceholderText(/search/i)
      fireEvent.focus(input)
      expect(screen.getByText('alpha')).toBeInTheDocument()
      fireEvent.keyDown(input, { key: 'Escape' })
      expect(screen.queryByText('alpha')).not.toBeInTheDocument()
      expect(input).toHaveValue('')
    })

    it('clicking a suggestion commits it and records history', () => {
      localStorage.setItem(
        'mvs-search-history:files',
        JSON.stringify({ maxSize: 10, entries: ['alpha'] })
      )
      const onSearch = vi.fn()
      render(<SearchBar mode="files" onSearch={onSearch} />)
      const input = screen.getByPlaceholderText(/search/i)
      fireEvent.focus(input)
      fireEvent.click(screen.getByText('alpha'))
      expect(input).toHaveValue('alpha')
      expect(onSearch).toHaveBeenCalledWith('alpha', expect.anything())
    })

    it('clicking "clear history" empties the suggestion list', () => {
      localStorage.setItem(
        'mvs-search-history:files',
        JSON.stringify({ maxSize: 10, entries: ['alpha'] })
      )
      render(<SearchBar mode="files" onSearch={() => {}} />)
      fireEvent.click(screen.getByRole('button', { name: /clear history/i }))
      fireEvent.focus(screen.getByPlaceholderText(/search/i))
      expect(screen.queryByText('alpha')).not.toBeInTheDocument()
    })

    it('the clear-history button is disabled when there is no history', () => {
      render(<SearchBar mode="files" onSearch={() => {}} />)
      expect(screen.getByRole('button', { name: /clear history/i })).toBeDisabled()
    })

    it('changing the max-size input updates the stored limit', () => {
      render(<SearchBar mode="files" onSearch={() => {}} />)
      const maxSizeInput = screen.getByLabelText(/history size|max.*history/i)
      fireEvent.change(maxSizeInput, { target: { value: '3' } })
      expect(JSON.parse(localStorage.getItem('mvs-search-history:files') ?? '{}').maxSize).toBe(3)
    })

    it('keeps files-mode and outline-mode search history separate', () => {
      localStorage.setItem(
        'mvs-search-history:files',
        JSON.stringify({ maxSize: 10, entries: ['files query'] })
      )
      render(<SearchBar mode="outline" onSearch={() => {}} />)
      fireEvent.focus(screen.getByPlaceholderText(/search/i))
      expect(screen.queryByText('files query')).not.toBeInTheDocument()
    })

    it('does not record history for the debounced live-search calls, only on explicit commit', () => {
      vi.useFakeTimers()
      render(<SearchBar mode="files" onSearch={() => {}} />)
      const input = screen.getByPlaceholderText(/search/i)
      fireEvent.change(input, { target: { value: 'typing...' } })
      vi.advanceTimersByTime(300)
      vi.useRealTimers()
      expect(localStorage.getItem('mvs-search-history:files')).toBeNull()
    })
  })
})
