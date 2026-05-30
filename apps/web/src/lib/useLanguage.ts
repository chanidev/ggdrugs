import { useTranslation } from 'react-i18next';
import type { SupportedLanguage } from './i18n.js';
import { SUPPORTED_LANGUAGES } from './i18n.js';

export function useLanguage() {
  const { i18n } = useTranslation();
  const current = (i18n.resolvedLanguage ?? i18n.language ?? 'ko') as SupportedLanguage;

  const setLanguage = async (lang: SupportedLanguage): Promise<void> => {
    await i18n.changeLanguage(lang);
    localStorage.setItem('i18n_language', lang);
  };

  return { current, setLanguage, languages: SUPPORTED_LANGUAGES };
}
