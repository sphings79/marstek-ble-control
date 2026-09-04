import { Box, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';

import { Footer } from '../Footer';

/**
 * Full-screen card used by the bridge-mode screens that stand in front of the dashboard
 * (claiming, login, device selection). Same shell as ScannerView so the two modes look alike.
 */
export const BridgeCard = ({ icon, title, description, children, below }: {
    icon: ReactNode;
    title: string;
    description: string;
    children: ReactNode;
    /** Rendered as its own card underneath, rather than nested inside this one. */
    below?: ReactNode;
}) => (
    <Box display="flex" flexDirection="column" minHeight="100vh" bgcolor="#f4f6f8">
        <Box flexGrow={1} display="flex" flexDirection="column" justifyContent="center" alignItems="center" gap={3} p={2}>
            <Paper
                elevation={4}
                sx={{ p: 5, textAlign: 'center', borderRadius: 4, maxWidth: 450, width: '100%', mx: 2 }}
            >
                <Box display="inline-flex" mb={3}>{icon}</Box>

                <Typography variant="h4" fontWeight="bold" gutterBottom>{title}</Typography>
                <Typography color="text.secondary" sx={{ mb: 4 }}>{description}</Typography>

                {children}
            </Paper>

            {below && <Box sx={{ maxWidth: 450, width: '100%', mx: 2 }}>{below}</Box>}
        </Box>

        <Footer />
    </Box>
);
