import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppearanceTab } from '../../src/frontend/components/settings/AppearanceTab.js'
import { DEFAULT_LOCAL_PREFS } from '../../src/frontend/hooks/useLocalPrefs.js'

describe('AppearanceTab', () => {
  it('selecting a theme option calls setPref with the new theme', () => {
    const setPref = vi.fn()
    render(<AppearanceTab prefs={DEFAULT_LOCAL_PREFS} setPref={setPref} />)
    fireEvent.click(screen.getByLabelText(/dark/i))
    expect(setPref).toHaveBeenCalledWith('theme', 'dark')
  })

  it('changing the font size input calls setPref with a number, not a string', () => {
    const setPref = vi.fn()
    render(<AppearanceTab prefs={DEFAULT_LOCAL_PREFS} setPref={setPref} />)
    fireEvent.change(screen.getByLabelText(/font size/i), { target: { value: '18' } })
    expect(setPref).toHaveBeenCalledWith('editorFontSize', 18)
  })

  it('changing the indent width input calls setPref with a number', () => {
    const setPref = vi.fn()
    render(<AppearanceTab prefs={DEFAULT_LOCAL_PREFS} setPref={setPref} />)
    fireEvent.change(screen.getByLabelText(/indent/i), { target: { value: '4' } })
    expect(setPref).toHaveBeenCalledWith('editorIndentWidth', 4)
  })

  it('changing the accent color input calls setPref with the hex value', () => {
    const setPref = vi.fn()
    render(<AppearanceTab prefs={DEFAULT_LOCAL_PREFS} setPref={setPref} />)
    fireEvent.change(screen.getByLabelText(/accent/i), { target: { value: '#ff0000' } })
    expect(setPref).toHaveBeenCalledWith('accentColor', '#ff0000')
  })
})
