import { useCallback, useMemo, useState, type ReactNode } from 'react';

import {
    I18nContext, initialLanguage, setActiveLanguage, translate,
    STORAGE_KEY, type Language, type Translate,
} from './i18n';

/**
 * Holds the chosen language.
 *
 * Only the provider lives here; the hooks and the plain `translate` sit in i18n.ts, so this file
 * exports a component and nothing else.
 */
export const I18nProvider = ({ children }: { children: ReactNode }) => {
    const [language, setLanguageState] = useState<Language>(() => {
        const initial = initialLanguage();
        setActiveLanguage(initial);
        return initial;
    });

    const setLanguage = useCallback((next: Language) => {
        setActiveLanguage(next);
        setLanguageState(next);
        document.documentElement.lang = next;
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Not worth telling anyone about; the choice simply lasts as long as the tab.
        }
    }, []);

    // Depends on `language` so components re-render when it changes, even though the lookup
    // itself goes through the module-level function.
    const t = useCallback<Translate>((key, vars) => {
        void language;
        return translate(key, vars);
    }, [language]);

    const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};
