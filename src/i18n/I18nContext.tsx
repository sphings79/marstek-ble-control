import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { en } from './en';
import { de } from './de';

export type Language = 'en' | 'de';

/**
 * The keys the app may ask for. Taken from the English strings, so German is checked against it -
 * a missing translation is a compile error rather than an English sentence appearing mid-page.
 */
export type StringKey = keyof typeof en;

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

const DICTIONARIES: Record<Language, Record<StringKey, string>> = { en, de };

const STORAGE_KEY = 'language';

interface I18n {
    language: Language;
    setLanguage: (language: Language) => void;
    t: Translate;
}

const I18nContext = createContext<I18n | null>(null);

/**
 * Whatever the browser says, if we speak it.
 *
 * A stored choice wins, because someone who switched to English on a German browser meant it.
 */
function initialLanguage(): Language {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'de') {
            return stored;
        }
    } catch {
        // Private window, or storage refused. The browser's own setting still works.
    }

    return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en';
}

export const I18nProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguageState] = useState<Language>(initialLanguage);

    const setLanguage = useCallback((next: Language) => {
        setLanguageState(next);
        document.documentElement.lang = next;
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Not worth telling anyone about; the choice simply lasts as long as the tab.
        }
    }, []);

    const t = useCallback<Translate>((key, vars) => {
        // Falling back to English rather than showing the key: a sentence in the wrong language
        // is still information, whereas "toggles.bluetooth.body" is not.
        const template = DICTIONARIES[language][key] ?? en[key] ?? key;

        if (!vars) {
            return template;
        }

        return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
            name in vars ? String(vars[name]) : whole);
    }, [language]);

    const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18n {
    const ctx = useContext(I18nContext);
    if (!ctx) {
        throw new Error('useI18n outside I18nProvider');
    }
    return ctx;
}

/** The common case: just the translate function. */
export function useT(): Translate {
    return useI18n().t;
}
