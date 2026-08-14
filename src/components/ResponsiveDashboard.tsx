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

export interface WidgetGroup {
    key: string;
    label: string;
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
export const ResponsiveDashboard = ({ groups }: Props) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));
    const [activeKey, setActiveKey] = useState(groups[0]?.key);
    const [drawerOpen, setDrawerOpen] = useState(false);

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
                <IconButton onClick={() => setDrawerOpen(true)} aria-label="Open menu">
                    <MenuIcon />
                </IconButton>
                <Typography variant="subtitle1" fontWeight="bold">{active?.label}</Typography>
            </Box>

            <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
                <Box sx={{ width: 270, height: '100%', display: 'flex', flexDirection: 'column' }} role="presentation">
                    <Box sx={{ px: 2, py: 2 }}>
                        <Typography variant="h6" fontWeight="bold">Menu</Typography>
                        <Typography variant="caption" color="text.secondary">Pick a section</Typography>
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
                                <ListItemText primary={g.label} />
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
                                <ListItemText primary="Star on GitHub" primaryTypographyProps={{ fontWeight: 'bold' }} />
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
                                Community fork of{' '}
                                <Link href={UPSTREAM_REPO} target="_blank" rel="noopener noreferrer" underline="hover">
                                    Hypfer/venuscontrol
                                </Link>
                                {' '}· not affiliated with Marstek
                            </Typography>
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
