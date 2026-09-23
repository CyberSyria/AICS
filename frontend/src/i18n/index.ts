import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en/translation.json'
import ar from './locales/ar/translation.json'

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('samp_lang') : null
const initialLng = saved === 'ar' || saved === 'en' ? saved : 'en'

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initialLng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function applyDocumentDirection(lng: string) {
  const dir = lng === 'ar' ? 'rtl' : 'ltr'
  document.documentElement.lang = lng
  document.documentElement.dir = dir
}

applyDocumentDirection(initialLng)

i18n.on('languageChanged', (lng) => {
  localStorage.setItem('samp_lang', lng)
  applyDocumentDirection(lng)
})

export default i18n
