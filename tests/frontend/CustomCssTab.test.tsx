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

  it('keeps text typed after a choice click when the settings prop later echoes that same choice', () => {
    // The click fires a PUT; while it is in flight the user starts typing. When
    // the PUT resolves, `settings.customCssChoice` changes user1 -> user2, but
    // that is this component's OWN choice coming back, not an external change,
    // so it must not wipe the in-progress draft.
    const updateSettings = vi.fn()
    const { rerender } = render(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.one {}' })}
        updateSettings={updateSettings}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /user 2/i }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.typed-after-click {}' } })
    rerender(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user2', customCssUser1: '.one {}' })}
        updateSettings={updateSettings}
      />
    )
    expect(screen.getByRole('textbox')).toHaveValue('.typed-after-click {}')
  })

  it('a genuinely external choice change still resets the active choice and drops the draft', () => {
    const { rerender } = render(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.one {}' })}
        updateSettings={() => {}}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.unapplied {}' } })
    rerender(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'developer', customCssUser1: '.one {}' })}
        updateSettings={() => {}}
      />
    )
    const textarea = screen.getByRole('textbox')
    expect(textarea).toHaveValue(DEVELOPER_CSS)
    expect(textarea).toHaveAttribute('readonly')
  })

  it('keeps showing the just-applied content while the PUT is still in flight', () => {
    const updateSettings = vi.fn(() => new Promise<void>(() => {}))
    render(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.old {}' })}
        updateSettings={updateSettings}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.new {}' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    expect(screen.getByRole('textbox')).toHaveValue('.new {}')
  })

  it('keeps the typed CSS visible when the PUT fails and settings never catch up', () => {
    const updateSettings = vi.fn()
    const { rerender } = render(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.old {}' })}
        updateSettings={updateSettings}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.new {}' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    // Failed PUT: the parent's settings stay at the pre-Apply value.
    rerender(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.old {}' })}
        updateSettings={updateSettings}
      />
    )
    expect(screen.getByRole('textbox')).toHaveValue('.new {}')
  })

  // IMPORTANT: these two tests deliberately do NOT use vi.fn() for
  // `updateSettings`. Vitest's mock instrumentation attaches its own
  // .then/.catch to whatever a mock implementation returns (to populate
  // `mock.results`), which itself "handles" the rejection from Node's
  // perspective — so a vi.fn()-wrapped rejecting function can never trigger
  // `unhandledRejection` here regardless of whether the component under test
  // has its own .catch. A plain function (with manual call tracking) is
  // required to actually exercise that failure mode.
  it('does not produce an unhandled promise rejection when updateSettings rejects (selectChoice)', async () => {
    const onUnhandledRejection = vi.fn()
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      let calls = 0
      function updateSettings() {
        calls += 1
        return Promise.reject(new Error('network blip'))
      }
      render(<CustomCssTab settings={baseSettings()} updateSettings={updateSettings} />)
      fireEvent.click(screen.getByRole('button', { name: /editorial/i }))
      expect(calls).toBe(1)
      // Let the rejected promise's microtask queue flush.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(onUnhandledRejection).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('does not produce an unhandled promise rejection when updateSettings rejects (applyDraft)', async () => {
    const onUnhandledRejection = vi.fn()
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      let calls = 0
      function updateSettings() {
        calls += 1
        return Promise.reject(new Error('network blip'))
      }
      render(
        <CustomCssTab
          settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.old {}' })}
          updateSettings={updateSettings}
        />
      )
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '.new {}' } })
      fireEvent.click(screen.getByRole('button', { name: /apply/i }))
      expect(calls).toBe(1)
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(onUnhandledRejection).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', onUnhandledRejection)
    }
  })

  it('drops the local draft once settings reflect the applied value', () => {
    const updateSettings = vi.fn()
    const { rerender } = render(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.old {}' })}
        updateSettings={updateSettings}
      />
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '.new {}' } })
    fireEvent.click(screen.getByRole('button', { name: /apply/i }))
    // PUT succeeds: the source of truth catches up, so the draft is dropped...
    rerender(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.new {}' })}
        updateSettings={updateSettings}
      />
    )
    // ...and a later external edit of the same slot is therefore visible.
    rerender(
      <CustomCssTab
        settings={baseSettings({ customCssChoice: 'user1', customCssUser1: '.external {}' })}
        updateSettings={updateSettings}
      />
    )
    expect(screen.getByRole('textbox')).toHaveValue('.external {}')
  })
})
