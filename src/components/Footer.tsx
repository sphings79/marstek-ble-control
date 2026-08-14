import { Box, Link, Typography, Stack } from '@mui/material';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import { GITHUB_REPO, UPSTREAM_REPO, PROJECT_LINKS } from '../lib/projectLinks';

export const Footer = () => (
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
                href={GITHUB_REPO}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontWeight: 'bold' }}
            >
                <StarBorderIcon sx={{ fontSize: 18 }} /> Star on GitHub
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
            Community fork of{' '}
            <Link
                href={UPSTREAM_REPO}
                target="_blank"
                rel="noopener noreferrer"
                underline="hover"
            >
                Hypfer/venuscontrol
            </Link>
            {' '}· not affiliated with Marstek
        </Typography>
    </Box>
);
