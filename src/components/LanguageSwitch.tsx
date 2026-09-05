import { ToggleButton, ToggleButtonGroup } from '@mui/material';

import { useI18n, type Language } from '../i18n/i18n';

/**
 * Two languages, so two buttons rather than a dropdown: the choice is visible and one click away,
 * and there is nothing to discover.
 */
export const LanguageSwitch = () => {
    const { language, setLanguage } = useI18n();

    return (
        <ToggleButtonGroup
            size="small"
            exclusive
            value={language}
            onChange={(_, next: Language | null) => next && setLanguage(next)}
            aria-label="Language"
        >
            <ToggleButton value="en" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem' }}>
                English
            </ToggleButton>
            <ToggleButton value="de" sx={{ px: 1.25, py: 0.25, fontSize: '0.75rem' }}>
                Deutsch
            </ToggleButton>
        </ToggleButtonGroup>
    );
};
