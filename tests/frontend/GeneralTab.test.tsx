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

  it('renders nothing crash-worthy when settings is still null (loading)', () => {
    expect(() =>
      render(
        <GeneralTab settings={null} updateSettings={() => {}} prefs={DEFAULT_LOCAL_PREFS} setPref={() => {}} />
      )
    ).not.toThrow()
  })
})
