import { createContext, useContext, useState, ReactNode } from 'react';

export type Language = 'ko' | 'en' | 'zh';

const labels: Record<Language, string> = { ko: '한국어', en: 'EN', zh: '中文' };
const flags: Record<Language, string> = { ko: '🇰🇷', en: '🇺🇸', zh: '🇨🇳' };

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (translations: Record<Language, string>) => string;
  labels: typeof labels;
  flags: typeof flags;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem('app-lang') as Language) || 'ko'
  );

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('app-lang', lang);
  };

  const t = (translations: Record<Language, string>) => translations[language] || translations.ko;

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t, labels, flags }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
};
