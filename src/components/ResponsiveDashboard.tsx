import { useState, type ReactNode } from 'react';
import {
    Box, Grid, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
    IconButton, Typography, Divider, Link, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import MenuIcon from '@mui/icons-material/Menu';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { GITHUB_REPO, UPSTREAM_REPO, PROJECT_LINKS } from '../lib/projectLinks';
import { useT, type StringKey } from '../i18n/i18n';
import { LanguageSwitch } from './LanguageSwitch';
import { useBLE } from '../contexts/BLEContext';
import { BridgeFirmwareCard } from './bridge/BridgeFirmwareCard';
import { BridgeSecurityCard } from './bridge/BridgeSecurityCard';

export interface WidgetGroup {
    key: string;
    /**
     * Looked up rather than stored, because the groups are module-level constants in each view
     * and would otherwise be built once, in whatever language happened to be active at import.
     */
    labelKey: StringKey;
    icon: ReactNode;
    widgets: ReactNode[];
}

interface Props {
    groups: WidgetGroup[];
}

/**
 * Renders a set of widget groups responsively:
 * - Desktop (md+): every widget in the familiar 3-column grid, groups flattened in order.
 * - Mobile (< md): a hamburger menu (Drawer) to pick one group at a time. The first group is the
 *   default landing view, so keep the essentials there. The project/related links sit at the
 *   bottom of the Drawer (mirroring the page Footer).
 */
export const ResponsiveDashboard = ({ groups: modelGroups }: Props) => {
    const t = useT();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { viaBridge } = useBLE();
    const [drawerOpen, setDrawerOpen] = useState(false);

    // The bridge is not part of any storage's feature set, so no model view declares it. It is
    // added here instead of in each of them: the rule "if we are reached through a bridge, its
    // firmware belongs in the System group" holds for every model, present and future.
    const groups = viaBridge
        ? modelGroups.map(group => group.key === 'system'
            ? { ...group, widgets: [...group.widgets, <BridgeFirmwareCard key="bridge-fw" />, <BridgeSecurityCard key="bridge-pw" />] }
            : group)
        : modelGroups;

    const [activeKey, setActiveKey] = useState(groups[0]?.key);

    if (!isMobile) {
        return (
            <Box sx={{ p: 3 }}>
                <Grid container spacing={3}>
                    {groups.flatMap(g => g.widgets).map((w, i) => (
                        <Grid key={i} size={{ xs: 12, md: 6, lg: 4 }}>{w}</Grid>
                    ))}
                </Grid>
            </Box>
        );
    }

    const active = groups.find(g => g.key === activeKey) ?? groups[0];

    return (
        <Box>
            {/* Group nav bar — sticks just below the 56px AppBar on mobile. */}
            <Box
                sx={{
                    position: 'sticky',
                    top: 56,
                    zIndex: theme.zIndex.appBar - 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    px: 1,
                    py: 0.5,
                    bgcolor: 'background.paper',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                }}
            >
                <IconButton onClick={() => setDrawerOpen(true)} aria-label={t('nav.openMenu')}>
                    <MenuIcon />
                </IconButton>
                <Typography variant="subtitle1" fontWeight="bold">{active ? t(active.labelKey) : ''}</Typography>
            </Box>

            <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: 270, height: '100%', display: 'flex', flexDirection: 'column' }} role="presentation">
                    <Box sx={{ px: 2, py: 2 }}>
                        <Typography variant="h6" fontWeight="bold">{t('nav.menu')}</Typography>
                        <Typography variant="caption" color="text.secondary">{t('nav.pickSection')}</Typography>
                    </Box>
                    <Divider />
                    <List>
                        {groups.map(g => (
                            <ListItemButton
                                key={g.key}
                                selected={g.key === active?.key}
                                onClick={() => { setActiveKey(g.key); setDrawerOpen(false); }}
                            >
                                <ListItemIcon sx={{ minWidth: 40 }}>{g.icon}</ListItemIcon>
                                <ListItemText primary={t(g.labelKey)} />
                            </ListItemButton>
                        ))}
                    </List>

                    {/* Project / related links, pinned to the bottom of the drawer. */}
                    <Box sx={{ mt: 'auto' }}>
                        <Divider />
                        <List dense>
                            <ListItemButton
                                component="a"
                                href={GITHUB_REPO}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}><StarBorderIcon fontSize="small" /></ListItemIcon>
                                <ListItemText primary={t('footer.star')} primaryTypographyProps={{ fontWeight: 'bold' }} />
                            </ListItemButton>

                            {PROJECT_LINKS.map(l => (
                                <ListItemButton
                                    key={l.href}
                                    component="a"
                                    href={l.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <ListItemIcon sx={{ minWidth: 36 }}><OpenInNewIcon fontSize="small" /></ListItemIcon>
                                    <ListItemText primary={l.label} />
                                </ListItemButton>
                            ))}
                        </List>
                        <Box sx={{ px: 2, py: 1.5 }}>
                            <Typography variant="caption" color="text.secondary" display="block">
                                {t('footer.forkOf')}{' '}
                                <Link href={UPSTREAM_REPO} target="_blank" rel="noopener noreferrer" underline="hover">
                                    Hypfer/venuscontrol
                                </Link>
                                {' '}· {t('footer.notAffiliated')}
                            </Typography>
                        </Box>

                        <Box sx={{ px: 2, pb: 2 }}>
                            <LanguageSwitch />
                        </Box>
                    </Box>
                </Box>
            </Drawer>

            <Box sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {active?.widgets.map((w, i) => <Box key={i}>{w}</Box>)}
                </Box>
            </Box>
        </Box>
    );
};
