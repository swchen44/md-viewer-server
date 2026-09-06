import { describe, it, expect } from 'vitest'
import i18n from '../../src/frontend/i18n/index.js'

describe('i18n setup', () => {
  it('has all 5 required languages loaded as resources', () => {
    const languages = Object.keys(i18n.services.resourceStore.data)
    for (const lang of ['en', 'zh-TW', 'zh-CN', 'ja', 'ko']) {
      expect(languages).toContain(lang)
    }
  })

  it('falls back to English for a missing key', () => {
    expect(i18n.t('nonexistent.key.that.does.not.exist')).toBe(
      'nonexistent.key.that.does.not.exist'
    )
  })

  it('translates a known key in the default language', () => {
    i18n.changeLanguage('en')
    expect(i18n.t('sidebar.filesTab')).toBe('Files')
  })

  it('translates the same key in Traditional Chinese', () => {
    i18n.changeLanguage('zh-TW')
    expect(i18n.t('sidebar.filesTab')).toBe('檔案')
  })
})
