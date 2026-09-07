import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GeneralTab } from '../../src/frontend/components/settings/GeneralTab.js'
import { DEFAULT_LOCAL_PREFS } from '../../src/frontend/hooks/useLocalPrefs.js'

function baseSettings(overrides = {}) {
  return {
    plantumlServerUrl: 'https://www.plantuml.com/plantuml',
    sendToPlantUmlServer: false,
    privacyMode: false,
    blockRemoteContent: false,
    allowHtmlScripts: false,
    bakOnSave: false,
    effective: { blockRemoteContent: false, sendToPlantUmlServer: false, allowHtmlScripts: false },
    ...overrides,
  }
}

describe('GeneralTab', () => {
  it('privacy-locked controls are enabled when privacyMode is false', () => {
    render(
      <GeneralTab
        settings={baseSettings()}
        updateSettings={() => {}}
        prefs={DEFAULT_LOCAL_PREFS}
        setPref={() => {}}
      />
    )
    expect(screen.getByLabelText(/allow.*html.*script/i)).not.toBeDisabled()
  })

  it('privacy-locked controls are disabled when privacyMode is true', () => {
    render(
      <GeneralTab
        settings={baseSettings({ privacyMode: true })}
        updateSettings={() => {}}
        prefs={DEFAULT_LOCAL_PREFS}
        setPref={() => {}}
      />
    )
    expect(screen.getByLabelText(/allow.*html.*script/i)).toBeDisabled()
    expect(screen.getByLabelText(/block.*remote/i)).toBeDisabled()
    expect(screen.getByLabelText(/send.*plantuml/i)).toBeDisabled()
  })

  // Privacy mode makes the server force these three to safe values while
  // leaving the user's raw stored preference intact (so unlocking restores
  // it). Displaying the raw value while locked therefore inverts what the
  // user sees: a stored allowHtmlScripts:true would show as CHECKED —
  // "scripts are allowed" — even though the server is refusing to allow them.
  // Locked, the checkbox must show the effective (enforced) value.
  describe('privacy-locked checkboxes display the effective value, not the raw stored one', () => {
    const lockedSettings = baseSettings({
      privacyMode: true,
      blockRemoteContent: false,
      sendToPlantUmlServer: true,
      allowHtmlScripts: true,
      effective: {
        blockRemoteContent: true,
        sendToPlantUmlServer: false,
        allowHtmlScripts: false,
      },
    })

    function renderLocked() {
      render(
        <GeneralTab
          settings={lockedSettings}
          updateSettings={() => {}}
          prefs={DEFAULT_LOCAL_PREFS}
          setPref={() => {}}
        />
      )
    }

    it('allowHtmlScripts shows unchecked when locked off despite a raw true', () => {
      renderLocked()
      expect(screen.getByLabelText(/allow.*html.*script/i)).not.toBeChecked()
    })

    it('sendToPlantUmlServer shows unchecked when locked off despite a raw true', () => {
      renderLocked()
      expect(screen.getByLabelText(/send.*plantuml/i)).not.toBeChecked()
    })

    it('blockRemoteContent shows checked when locked on despite a raw false', () => {
      renderLocked()
      expect(screen.getByLabelText(/block.*remote/i)).toBeChecked()
    })

    it('shows the raw stored values when privacy mode is off', () => {
      render(
        <GeneralTab
          settings={baseSettings({
            privacyMode: false,
            blockRemoteContent: false,
            sendToPlantUmlServer: true,
            allowHtmlScripts: true,
            effective: {
              blockRemoteContent: false,
              sendToPlantUmlServer: true,
              allowHtmlScripts: true,
            },
          })}
          updateSettings={() => {}}
          prefs={DEFAULT_LOCAL_PREFS}
          setPref={() => {}}
        />
      )
      expect(screen.getByLabelText(/allow.*html.*script/i)).toBeChecked()
      expect(screen.getByLabelText(/send.*plantuml/i)).toBeChecked()
      expect(screen.getByLabelText(/block.*remote/i)).not.toBeChecked()
    })
  })

  it('toggling privacyMode calls updateSettings with the new value', () => {
    const updateSettings = vi.fn()
    render(
      <GeneralTab
        settings={baseSettings()}
        updateSettings={updateSettings}
        prefs={DEFAULT_LOCAL_PREFS}
        setPref={() => {}}
      />
    )
    fireEvent.click(screen.getByLabelText(/privacy mode/i))
    expect(updateSettings).toHaveBeenCalledWith({ privacyMode: true })
  })

  it('toggling a local pref calls setPref, not updateSettings', () => {
    const setPref = vi.fn()
    const updateSettings = vi.fn()
    render(
      <GeneralTab
        settings={baseSettings()}
        updateSettings={updateSettings}
        prefs={DEFAULT_LOCAL_PREFS}
        setPref={setPref}
      />
    )
    fireEvent.click(screen.getByLabelText(/hidden files/i))
    expect(setPref).toHaveBeenCalledWith('showHiddenFiles', true)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  describe('PlantUML server URL field commits on blur, not on every keystroke', () => {
    it('typing without blurring does not call updateSettings', () => {
      const updateSettings = vi.fn()
      render(
        <GeneralTab
          settings={baseSettings()}
          updateSettings={updateSettings}
          prefs={DEFAULT_LOCAL_PREFS}
          setPref={() => {}}
        />
      )
      const input = screen.getByLabelText(/plantuml server url/i)
      fireEvent.change(input, { target: { value: 'https://plantuml.example.com' } })
      fireEvent.change(input, { target: { value: 'https://plantuml.example.com/x' } })
      expect(updateSettings).not.toHaveBeenCalled()
    })

    it('blurring after typing calls updateSettings exactly once with the final value', () => {
      const updateSettings = vi.fn()
      render(
        <GeneralTab
          settings={baseSettings()}
          updateSettings={updateSettings}
          prefs={DEFAULT_LOCAL_PREFS}
          setPref={() => {}}
        />
      )
      const input = screen.getByLabelText(/plantuml server url/i)
      fireEvent.change(input, { target: { value: 'https://plantuml.example.com' } })
      fireEvent.change(input, { target: { value: 'https://plantuml.example.com/final' } })
      fireEvent.blur(input)
      expect(updateSettings).toHaveBeenCalledTimes(1)
      expect(updateSettings).toHaveBeenCalledWith({
        plantumlServerUrl: 'https://plantuml.example.com/final',
      })
    })

    it('keeps typing that happens after a blur-commit, once the settings prop echoes that same commit back', () => {
      const updateSettings = vi.fn()
      const { rerender } = render(
        <GeneralTab
          settings={baseSettings()}
          updateSettings={updateSettings}
          prefs={DEFAULT_LOCAL_PREFS}
          setPref={() => {}}
        />
      )
      const input = screen.getByLabelText(/plantuml server url/i)
      fireEvent.change(input, { target: { value: 'https://b.example.com' } })
      fireEvent.blur(input)
      expect(updateSettings).toHaveBeenCalledWith({ plantumlServerUrl: 'https://b.example.com' })

      // The user refocuses and keeps typing before the PUT that committed
      // "https://b.example.com" has round-tripped back into the settings prop.
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'https://b.example.com/extra' } })

      // Now the round-trip lands: settings reflects the committed value, which
      // is just an echo of this component's own blur, not a change from
      // elsewhere. It must not clobber what was typed since then.
      rerender(
        <GeneralTab
          settings={baseSettings({ plantumlServerUrl: 'https://b.example.com' })}
          updateSettings={updateSettings}
          prefs={DEFAULT_LOCAL_PREFS}
          setPref={() => {}}
        />
      )
      expect(input).toHaveValue('https://b.example.com/extra')
    })
  })

  it('renders nothing crash-worthy when settings is still null (loading)', () => {
    expect(() =>
      render(
        <GeneralTab settings={null} updateSettings={() => {}} prefs={DEFAULT_LOCAL_PREFS} setPref={() => {}} />
      )
    ).not.toThrow()
  })
})
