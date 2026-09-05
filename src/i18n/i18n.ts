import { createContext, useContext } from 'react';

import { en } from './en';
import { de } from './de';

export type Language = 'en' | 'de';

/**
 * The keys the app may ask for. Taken from the English strings, so German is checked against it -
 * a missing translation is a compile error rather than an English sentence appearing mid-page.
 */
export type StringKey = keyof typeof en;

export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

export const DICTIONARIES: Record<Language, Record<StringKey, string>> = { en, de };

export const STORAGE_KEY = 'language';

export interface I18n {
    language: Language;
    setLanguage: (language: Language) => void;
    t: Translate;
}

export const I18nContext = createContext<I18n | null>(null);

// The transports and the auth helpers produce messages that end up in front of someone, and none
// of them is a component, so none of them can hold a hook. They read the language through here
// instead; the provider keeps it in step.
let active: Language = 'en';

/** Called by the provider only. */
export function setActiveLanguage(next: Language) {
    active = next;
}

/**
 * Whatever the browser says, if we speak it.
 *
 * A stored choice wins, because someone who switched to English on a German browser meant it.
 */
export function initialLanguage(): Language {
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

/** Translate outside React. Inside a component, use `useT` so it re-renders on a change. */
export function translate(key: StringKey, vars?: Record<string, string | number>): string {
    // Falling back to English rather than showing the key: a sentence in the wrong language is
    // still information, whereas "toggles.bluetooth.desc" is not.
    const template = DICTIONARIES[active][key] ?? en[key] ?? key;

    if (!vars) {
        return template;
    }

    return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
        name in vars ? String(vars[name]) : whole);
}

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
