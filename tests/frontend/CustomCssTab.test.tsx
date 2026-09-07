import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CustomCssTab } from '../../src/frontend/components/settings/CustomCssTab.js'
import { EDITORIAL_CSS, DEVELOPER_CSS } from '../../src/frontend/custom-css-presets.js'

function baseSettings(overrides = {}) {
  return {
    plantumlServerUrl: 'https://www.plantuml.com/plantuml',
    sendToPlantUmlServer: false,
    privacyMode: false,
    blockRemoteContent: false,
    allowHtmlScripts: false,
    bakOnSave: false,
    customCssChoice: 'user1',
    customCssUser1: '',
    customCssUser2: '',
    effective: { blockRemoteContent: false, sendToPlantUmlServer: false, allowHtmlScripts: false },
    ...overrides,
  }
}

describe('CustomCssTab', () => {
  it('shows the editorial preset content in a readonly textarea when selected', () => {
    render(<CustomCssTab settings={baseSettings({ customCssChoice: 'editorial' })} updateSettings={() => {}} />)
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea).toHaveValue(EDITORIAL_CSS)
    expect(textarea).toHaveAttribute('readonly')
  })

  it('shows the developer preset content in a readonly textarea when selected', () => {
    render(<CustomCssTab settings={baseSettings({ customCssChoice: 'developer' })} updateSettings={() => {}} />)
    expect(screen.getByRole('textbox')).toHaveValue(DEVELOPER_CSS)
  })

  it('shows user1 slot content in an editable textarea when selected', () => {
    render(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.markdown-body { color: red; }' })}
        updateSettings={() => {}}
      />
    )
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea).toHaveValue('.markdown-body { color: red; }')
    expect(textarea).not.toHaveAttribute('readonly')
  })

  it('switching to a built-in choice calls updateSettings with just the choice', () => {
    const updateSettings = vi.fn()
    render(<CustomCssTab settings={baseSettings()} updateSettings={updateSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /editorial/i }))
    expect(updateSettings).toHaveBeenCalledWith({ customCssChoice: 'editorial' })
  })

  it('editing the user1 draft then clicking Apply persists the slot and switches the active choice in one call', () => {
    const updateSettings = vi.fn()
    render(
      <CustomCssTab settings={baseSettings({ customCssChoice: 'user2' })} updateSettings={updateSettings} />
    )
    fireEvent.click(screen.getByRole('button', { name: /user 1/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.markdown-body { color: blue; }' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(updateSettings).toHaveBeenCalledWith({
      customCssChoice: 'user1',
      customCssUser1: '.markdown-body { color: blue; }',
    })
  })

  it('the Apply button is not shown for built-in (readonly) choices', () => {
    render(<CustomCssTab settings={baseSettings({ customCssChoice: 'editorial' })} updateSettings={() => {}} />)
    expect(screen.queryByRole('button', { name: /apply/i })).not.toBeInTheDocument()
  })
})
