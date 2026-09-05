import { Box, Typography } from '@mui/material';

import { useT } from '../../i18n/i18n';

export const GenericDeviceView = () => {
    const t = useT();

    return (
        <Box p={4} textAlign="center">
            <Typography variant="h5">{t('generic.title')}</Typography>
            <Typography>{t('generic.body')}</Typography>
        </Box>
    );
};
