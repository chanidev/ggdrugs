import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

export type SupportedLanguage = 'ko' | 'en' | 'vi' | 'zh' | 'ja' | 'fr';

export const SUPPORTED_LANGUAGES: Array<{
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
}> = [
  { code: 'ko', label: 'Korean',     nativeLabel: '한국어' },
  { code: 'en', label: 'English',    nativeLabel: 'English' },
  { code: 'vi', label: 'Vietnamese', nativeLabel: 'Tiếng Việt' },
  { code: 'zh', label: 'Chinese',    nativeLabel: '中文' },
  { code: 'ja', label: 'Japanese',   nativeLabel: '日本語' },
  { code: 'fr', label: 'French',     nativeLabel: 'Français' },
];

export const NAMESPACES = [
  'common', 'navigation', 'community', 'mate', 'chat',
  'uploader', 'admin', 'mypage',
] as const;

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'ko',
    supportedLngs: ['ko', 'en', 'vi', 'zh', 'ja', 'fr'],
    defaultNS: 'common',
    ns: NAMESPACES,
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18n_language',
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
    // [이슈 5] useSuspense:false — Suspense 경계 없이 빈 화면/에러 방지.
    // 번역 로드 전 키 원문(ko) 표시 후 교체되므로 UX 영향 최소.
    react: {
      useSuspense: false,
    },
  });

export default i18n;
