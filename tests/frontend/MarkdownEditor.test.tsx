import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarkdownEditor } from '../../src/frontend/components/MarkdownEditor.js'

describe('MarkdownEditor', () => {
  it('renders the current value in a textarea', () => {
    render(<MarkdownEditor value="hello" onChange={() => {}} onSave={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue('hello')
  })

  it('calls onChange with the new value when the user types', () => {
    const onChange = vi.fn()
    render(<MarkdownEditor value="hello" onChange={onChange} onSave={() => {}} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello world' } })
    expect(onChange).toHaveBeenCalledWith('hello world')
  })

  it('calls onSave and prevents default on Ctrl+S', () => {
    const onSave = vi.fn()
    render(<MarkdownEditor value="hello" onChange={() => {}} onSave={onSave} />)
    const textarea = screen.getByRole('textbox')
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)
    expect(onSave).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
  })

  it('calls onSave on Cmd+S (metaKey, for Mac)', () => {
    const onSave = vi.fn()
    render(<MarkdownEditor value="hello" onChange={() => {}} onSave={onSave} />)
    const textarea = screen.getByRole('textbox')
    const event = new KeyboardEvent('keydown', { key: 's', metaKey: true, bubbles: true, cancelable: true })
    textarea.dispatchEvent(event)
    expect(onSave).toHaveBeenCalledOnce()
  })
})
