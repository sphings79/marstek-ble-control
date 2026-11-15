import { useContext } from 'react';
import { Box, Link, Typography, Stack } from '@mui/material';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { BRIDGE_REPO, GITHUB_REPO, UPSTREAM_REPO, PROJECT_LINKS } from '../lib/projectLinks';
import { BLEContext } from '../contexts/BLEContext';
import { useT } from '../i18n/i18n';
import { LanguageSwitch } from './LanguageSwitch';
import { APP_VERSION } from '../version';

export const Footer = () => {
    const t = useT();
    // Optional on purpose: the footer also shows on screens that sit outside the provider.
    const viaBridge = useContext(BLEContext)?.viaBridge ?? false;

    return (
    <Box
        component="footer"
        sx={{
            mt: 'auto',
            py: 3,
            px: 2,
            textAlign: 'center',
            color: 'text.secondary',
        }}
    >
        <Stack
            direction="row"
            spacing={1.5}
            justifyContent="center"
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            sx={{ mb: 1 }}
        >
            <Link
                href={viaBridge ? BRIDGE_REPO : GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold' }}
            >
                <StarBorderIcon sx={{ fontSize: 18 }} /> {t('footer.star')}
            </Link>

            {PROJECT_LINKS.map(l => (
                <Link
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    variant="body2"
                >
                    {l.label}
                </Link>
            ))}
        </Stack>

        <Typography variant="caption" display="block">
            {t('footer.thanksPre')}{' '}
            <Link
                href={UPSTREAM_REPO}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
            >
                Hypfer
            </Link>
            {t('footer.thanksPost')}{' '}· {t('footer.notAffiliated')}
        </Typography>

        <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center' }}>
            <LanguageSwitch />
        </Box>

        <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            {t('footer.version', { version: APP_VERSION })}
        </Typography>
    </Box>
    );
};
