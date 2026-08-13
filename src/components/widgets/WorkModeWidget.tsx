import { useEffect, useState, useRef } from 'react';
import {
    Paper, Typography, Box, CircularProgress, Button, Stack,
    Switch, TextField, IconButton, Tooltip, MenuItem, 
    Select, InputAdornment, Alert, Fade, Chip,
    Accordion, AccordionSummary, AccordionDetails
} from '@mui/material';
import SettingsSuggestIcon from '@mui/icons-material/SettingsSuggest';
import RefreshIcon from '@mui/icons-material/Refresh';
import SaveIcon from '@mui/icons-material/Save';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CheckIcon from '@mui/icons-material/Check';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

import { useBLE, useVenusData } from '../../contexts/BLEContext';
import { ConnectionState } from '../../lib/BLEConnectionManager';
import { COMMAND_ID, MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT, WORK_MODE, MANUAL_MODE_SCHEDULE_ITEM_ACTION } from '../../lib/VenusConst.ts';
import { SetWorkModePayload } from '../../lib/payloads/SetWorkModePayload.ts';
import { ManualWorkModeSlotControlPayload } from '../../lib/payloads/ManualWorkModeSlotControlPayload.ts';
import type {WorkModeSetting} from "../../lib/payloads/GetWorkModeSettingsPayload.ts";

const REQUEST_PAYLOAD = new Uint8Array([0x01]);

const DAYS = [
    { label: 'Mo', mask: MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.MONDAY },
    { label: 'Tu', mask: MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.TUESDAY },
    { label: 'We', mask: MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.WEDNESDAY },
    { label: 'Th', mask: MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.THURSDAY },
    { label: 'Fr', mask: MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.FRIDAY },
    { label: 'Sa', mask: MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.SATURDAY },
    { label: 'Su', mask: MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.SUNDAY },
];

const formatTime = (h: number, m: number) => 
    `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

const parseTime = (timeStr: string) => {
    const [h, m] = timeStr.split(':').map(Number);
    return { h: h || 0, m: m || 0 };
};

const DaySelector = ({ days, onChange, disabled }: { days: number, onChange: (d: number) => void, disabled: boolean }) => {
    const toggleDay = (mask: number) => {
        if (days & mask) onChange(days & ~mask);
        else onChange(days | mask);
    };

    return (
        <Box display="flex" gap={0.5} width="100%">
            {DAYS.map(d => {
                const isSelected = (days & d.mask) !== 0;
                return (
                    <Chip
                        key={d.mask}
                        label={d.label}
                        onClick={() => !disabled && toggleDay(d.mask)}
                        color={isSelected ? "primary" : "default"}
                        variant={isSelected ? "filled" : "outlined"}
                        disabled={disabled}
                        size="small"
                        icon={<CheckIcon sx={{ fontSize: 16, opacity: isSelected ? 1 : 0, transition: 'opacity 0.2s' }} />}
                        sx={{ 
                            flex: 1, 
                            cursor: disabled ? 'default' : 'pointer', 
                            fontWeight: isSelected ? 'bold' : 'normal',
                            '& .MuiChip-label': { px: 0.5 },
                            '& .MuiChip-icon': { ml: 0.5, mr: -0.5 }
                        }}
                    />
                );
            })}
        </Box>
    );
};

const ScheduleItemUI = ({ 
    setting, 
    disabled, 
    isSaving,
    isUpsSlot = false,
    minPower,
    maxPower,
    onSave, 
    onDelete 
}: { 
    setting: WorkModeSetting, 
    disabled: boolean, 
    isSaving: boolean,
    isUpsSlot?: boolean,
    minPower: number,
    maxPower: number,
    onSave: (s: WorkModeSetting) => void,
    onDelete?: (slotIndex: number, originalSetting: WorkModeSetting) => void
}) => {
    const defaultPower = Math.max(minPower, Math.min(maxPower, 500));
    const basePower = setting.absolutePowerLimit || defaultPower;

    const isNewDraft = setting.isEmpty && !isUpsSlot;

    const [enabled, setEnabled] = useState(isNewDraft ? true : setting.enabled);
    const [action, setAction] = useState(isNewDraft ? MANUAL_MODE_SCHEDULE_ITEM_ACTION.CHARGE : setting.action);
    const [startTime, setStartTime] = useState(isNewDraft ? "00:00" : formatTime(setting.startHour, setting.startMinute));
    const [endTime, setEndTime] = useState(isNewDraft ? "06:00" : formatTime(setting.endHour, setting.endMinute));
    const [days, setDays] = useState(isNewDraft ? MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.EVERYDAY : setting.days);

    const [power, setPower] = useState<number | ''>(basePower);

    useEffect(() => {
        if (!setting.isEmpty || isUpsSlot) {
            setEnabled(setting.enabled);
            setAction(setting.action);
            setStartTime(formatTime(setting.startHour, setting.startMinute));
            setEndTime(formatTime(setting.endHour, setting.endMinute));
            setDays(setting.days);
            setPower(setting.absolutePowerLimit || defaultPower);
        }
    }, [setting, isUpsSlot, defaultPower]);

    const currentPower = power === '' ? 0 : power;

    const isDirty = isNewDraft || 
        enabled !== setting.enabled ||
        action !== setting.action ||
        currentPower !== basePower ||
        (!isUpsSlot && (
            startTime !== formatTime(setting.startHour, setting.startMinute) ||
            endTime !== formatTime(setting.endHour, setting.endMinute) ||
            days !== setting.days
        ));

    const isValidPower = action === MANUAL_MODE_SCHEDULE_ITEM_ACTION.SELF_CONSUMPTION || (currentPower >= minPower && currentPower <= maxPower);
    const canSave = isDirty && isValidPower && !isSaving;

    const handleSave = () => {
        const start = parseTime(startTime);
        const end = parseTime(endTime);

        onSave({
            ...setting,
            action,
            enabled,
            startHour: isUpsSlot ? 0 : start.h,
            startMinute: isUpsSlot ? 0 : start.m,
            endHour: isUpsSlot ? 23 : end.h,
            endMinute: isUpsSlot ? 59 : end.m,
            days: isUpsSlot ? MANUAL_MODE_SCHEDULE_ITEM_DAY_BIT.EVERYDAY : days,
            absolutePowerLimit: currentPower
        });
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, opacity: disabled && !isUpsSlot && !isSaving ? 0.6 : 1, pointerEvents: disabled && !isUpsSlot && !isSaving ? 'none' : 'auto', borderColor: isDirty ? 'primary.main' : undefined }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Box display="flex" alignItems="center" gap={1.5}>
                    {isUpsSlot ? (
                        <Typography variant="subtitle2" fontWeight="bold">
                            UPS Mode
                        </Typography>
                    ) : (
                        <Select
                            size="small"
                            value={action}
                            onChange={(e) => setAction(Number(e.target.value) as MANUAL_MODE_SCHEDULE_ITEM_ACTION)}
                            sx={{ fontWeight: 'bold', minWidth: 160 }}
                            disabled={isSaving}
                        >
                            <MenuItem value={MANUAL_MODE_SCHEDULE_ITEM_ACTION.CHARGE}>Charge</MenuItem>
                            <MenuItem value={MANUAL_MODE_SCHEDULE_ITEM_ACTION.DISCHARGE}>Discharge</MenuItem>
                            <MenuItem value={MANUAL_MODE_SCHEDULE_ITEM_ACTION.SELF_CONSUMPTION}>Self-Consumption</MenuItem>
                        </Select>
                    )}
                    
                    {isDirty && !isSaving && (
                        <Chip label="Unsaved" color="warning" size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                    )}
                </Box>
                
                <Box display="flex" alignItems="center" gap={1}>
                    <Switch checked={enabled} onChange={e => setEnabled(e.target.checked)} color={isUpsSlot ? "warning" : "primary"} disabled={isSaving} />
                    {!isUpsSlot && onDelete && (
                        <IconButton color="error" size="small" onClick={() => onDelete(setting.slotIndex, setting)} disabled={isSaving}>
                            <DeleteOutlineIcon />
                        </IconButton>
                    )}
                </Box>
            </Box>
            
            <Stack spacing={2}>
                {!isUpsSlot && (
                    <>
                        <Box display="flex" gap={2}>
                            <TextField 
                                label="Start Time" type="time" value={startTime} 
                                onChange={e => setStartTime(e.target.value)} fullWidth size="small" 
                                slotProps={{ inputLabel: { shrink: true } }} disabled={isSaving}
                            />
                            <TextField 
                                label="End Time" type="time" value={endTime} 
                                onChange={e => setEndTime(e.target.value)} fullWidth size="small" 
                                slotProps={{ inputLabel: { shrink: true } }} disabled={isSaving}
                            />
                        </Box>
                        <DaySelector days={days} onChange={setDays} disabled={isSaving} />
                    </>
                )}

                {action !== MANUAL_MODE_SCHEDULE_ITEM_ACTION.SELF_CONSUMPTION && (
                    <TextField 
                        label="(Dis-)Charge Power" 
                        type="number" 
                        value={power} 
                        onChange={e => {
                            const val = e.target.value;
                            if (val === '') setPower('');
                            else setPower(Math.abs(parseInt(val, 10)));
                        }}
                        fullWidth size="small" 
                        error={!isValidPower}
                        helperText={!isValidPower ? `Must be between ${minPower}W and ${maxPower}W` : ""}
                        slotProps={{ 
                            input: { 
                                endAdornment: <InputAdornment position="end">W</InputAdornment>,
                                inputProps: { min: minPower, max: maxPower }
                            } 
                        }}
                        disabled={(isUpsSlot && !enabled) || isSaving}
                    />
                )}

                <Button 
                    variant={isDirty ? (isUpsSlot ? "contained" : "contained") : "outlined"} 
                    color={isUpsSlot ? "warning" : "primary"} 
                    onClick={handleSave} 
                    disabled={!canSave}
                    size="small" 
                    disableElevation
                >
                    {isSaving ? (
                        <Fade in={true}>
                            <Box display="flex" alignItems="center" gap={1}>
                                <CircularProgress size={16} color="inherit" />
                                <span>Saving...</span>
                            </Box>
                        </Fade>
                    ) : (
                        <Box display="flex" alignItems="center" gap={1}>
                            <SaveIcon fontSize="small" />
                            <span>{isDirty ? "Save Changes" : "Saved"}</span>
                        </Box>
                    )}
                </Button>
            </Stack>
        </Paper>
    );
};

interface Props {
    scheduleItemMinPower?: number;
    scheduleItemMaxPower?: number;
    scheduleItemUPSSupported?: boolean;
}

export const WorkModeWidget = ({ 
    scheduleItemMinPower = 100, 
    scheduleItemMaxPower = 1200, 
    scheduleItemUPSSupported = false,
}: Props) => {
    const { sendPacket, connectionState, pollState } = useBLE();
    const isConnected = connectionState === ConnectionState.CONNECTED;

    const stateData = useVenusData(COMMAND_ID.STATE);
    const scheduleData = useVenusData(COMMAND_ID.GET_WORK_MODE_SETTINGS);
    const serverWorkMode = stateData?.attributes.WorkMode;
    
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    
    const [busySlotIndex, setBusySlotIndex] = useState<number | null>(null);
    const [targetGlobalMode, setTargetGlobalMode] = useState<WORK_MODE | null>(null);
    
    const [globalMode, setGlobalMode] = useState<WORK_MODE | null>(null);
    
    const [addedDraftSlots, setAddedDraftSlots] = useState<number[]>([]);
    const [manualExpanded, setManualExpanded] = useState<boolean>(false);

    const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const busyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // The device tends to ignore commands for the first ~1-2s after connecting, so the single
    // request fired on connect is usually lost (whereas a later manual poll works). Retry the
    // initial fetch a few times, spaced out, until the schedule actually arrives. Once
    // scheduleData is set this effect re-runs, returns early, and the previous cleanup stops the loop.
    useEffect(() => {
        if (!isConnected || scheduleData) return;

        let cancelled = false;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout>;

        const attempt = () => {
            if (cancelled || attempts >= 6) return;
            attempts++;
            fetchSettings();
            timer = setTimeout(attempt, 3000);
        };
        timer = setTimeout(attempt, 800);

        return () => { cancelled = true; clearTimeout(timer); };
    }, [isConnected, scheduleData]);

    useEffect(() => {
        if (serverWorkMode !== undefined && !isBusy) {
            setGlobalMode(serverWorkMode as WORK_MODE);
        }
    }, [serverWorkMode, isBusy]);

    useEffect(() => {
        if (isBusy && busySlotIndex === null && serverWorkMode !== undefined && targetGlobalMode !== null) {
            if (serverWorkMode === targetGlobalMode) {
                if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current);
                setIsBusy(false);
                setTargetGlobalMode(null);
            }
        }
    }, [serverWorkMode, isBusy, busySlotIndex, targetGlobalMode]);

    useEffect(() => {
        if (scheduleData) {
            setAddedDraftSlots([]);
            
            if (isRefreshing) {
                if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
                setIsRefreshing(false);
            }

            if (isBusy && busySlotIndex !== null) {
                if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current);
                setIsBusy(false);
                setBusySlotIndex(null);
            }
        }
    }, [scheduleData]);

    useEffect(() => {
        if (globalMode !== null) {
            setManualExpanded(globalMode === WORK_MODE.MANUAL);
        }
    }, [globalMode]);

    const fetchSettings = async () => {
        // Note: intentionally not guarding on isRefreshing here so the initial-load retry loop
        // below can re-send even while a previous (lost) request is still "in flight". Manual
        // re-triggering is already prevented by the refresh button being disabled while refreshing.
        if (!isConnected) return;
        
        setIsRefreshing(true);
        if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = setTimeout(() => setIsRefreshing(false), 7_500);

        try {
            await sendPacket(COMMAND_ID.GET_WORK_MODE_SETTINGS, REQUEST_PAYLOAD);
        } catch (e) {
            console.error("Failed to fetch settings", e);
            if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
            setIsRefreshing(false);
        }
    };

    const handleGlobalModeChange = async (mode: WORK_MODE) => {
        if (!isConnected || isBusy) return;
        
        setTargetGlobalMode(mode);
        setGlobalMode(mode);
        setIsBusy(true);
        setBusySlotIndex(null);
        
        if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current);
        busyTimeoutRef.current = setTimeout(() => {
            setIsBusy(false);
            setTargetGlobalMode(null);
            if (serverWorkMode !== undefined) {
                setGlobalMode(serverWorkMode as WORK_MODE);
            }
        }, 7_500);

        try {
            const payload = new SetWorkModePayload(mode);
            await sendPacket(COMMAND_ID.SET_WORK_MODE, payload.toBytes());
            
            setTimeout(() => { pollState(); }, 1_500);
        } catch (e) {
            console.error("Failed to set global mode", e);
            if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current);
            setIsBusy(false);
            setTargetGlobalMode(null);
            if (serverWorkMode !== undefined) {
                setGlobalMode(serverWorkMode as WORK_MODE);
            }
        }
    };

    const saveSlotConfig = async (s: WorkModeSetting) => {
        if (!isConnected || isBusy) return;
        
        setIsBusy(true);
        setBusySlotIndex(s.slotIndex);

        if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current);
        busyTimeoutRef.current = setTimeout(() => {
            setIsBusy(false);
            setBusySlotIndex(null);
        }, 10_000); 

        try {
            const payload = new ManualWorkModeSlotControlPayload(
                s.slotIndex, s.action, s.startHour, s.startMinute, s.endHour, s.endMinute, s.days, s.absolutePowerLimit, s.enabled
            );
            await sendPacket(COMMAND_ID.SET_WORK_MODE, payload.toBytes());
            
            setTimeout(() => { fetchSettings(); }, 1_500);
        } catch (e) {
            console.error(`Failed to save slot ${s.slotIndex}`, e);
            if (busyTimeoutRef.current) clearTimeout(busyTimeoutRef.current);
            setIsBusy(false);
            setBusySlotIndex(null);
        }
    };

    const handleDelete = async (slotIndex: number, originalSetting: WorkModeSetting) => {
        if (originalSetting.isEmpty) {
            setAddedDraftSlots(prev => prev.filter(id => id !== slotIndex));
            return;
        }

        const deletedState: WorkModeSetting = {
            ...originalSetting,
            startHour: 0, startMinute: 0, endHour: 0, endMinute: 0,
            enabled: false
        };
        await saveSlotConfig(deletedState);
    };

    const handleAdd = () => {
        if (!scheduleData) return;
        const emptySlot = scheduleData.settings.find(s => s.isEmpty && s.slotIndex < 9 && !addedDraftSlots.includes(s.slotIndex));
        
        if (emptySlot) {
            setAddedDraftSlots(prev => [...prev, emptySlot.slotIndex]);
        } else {
            alert(`No available schedule slots (Max 9).`);
        }
    };

    const upsSetting = scheduleItemUPSSupported ? scheduleData?.settings.find(s => s.slotIndex === 9) : undefined;
    const isUpsActive = upsSetting?.enabled ?? false;
    
    const renderableSchedules = scheduleData?.settings.filter(
        s => (!s.isEmpty || addedDraftSlots.includes(s.slotIndex)) && s.slotIndex < 9
    ) || [];

    return (
        <Paper elevation={3} sx={{ p: 0, height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, minHeight: '72px', bgcolor: 'primary.dark', color: 'primary.contrastText', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <SettingsSuggestIcon />
                    <Typography variant="h6" fontWeight="bold">Work Mode</Typography>
                </Box>
                <Tooltip title="Poll Settings">
                    <span>
                        <IconButton onClick={fetchSettings} disabled={!isConnected || isRefreshing || isBusy || globalMode === null} sx={{ color: 'inherit' }}>
                            <RefreshIcon sx={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none', '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } } }} />
                        </IconButton>
                    </span>
                </Tooltip>
            </Box>

            <Box sx={{ p: 3, flexGrow: 1, overflowY: 'auto' }}>
                {!isConnected ? (
                    <Box display="flex" justifyContent="center" py={4}>
                        <Typography variant="body2" color="text.secondary">Waiting for connection...</Typography>
                    </Box>
                ) : (!scheduleData || globalMode === null) ? (
                    <Box display="flex" flexDirection="column" alignItems="center" py={4}>
                        <CircularProgress size={24} sx={{ mb: 1 }} />
                        <Typography variant="caption" color="text.secondary">Polling configuration...</Typography>
                    </Box>
                ) : (
                    <Stack spacing={3}>
                        <Box>
                            <Stack direction="row" spacing={1} mb={2}>
                                <Button 
                                    variant={globalMode === WORK_MODE.SELF_CONSUMPTION ? "contained" : "outlined"} 
                                    fullWidth 
                                    onClick={() => handleGlobalModeChange(WORK_MODE.SELF_CONSUMPTION)}
                                    disabled={isBusy}
                                >
                                    Self-Consumption
                                </Button>
                                <Button 
                                    variant={globalMode === WORK_MODE.MANUAL ? "contained" : "outlined"} 
                                    fullWidth 
                                    onClick={() => handleGlobalModeChange(WORK_MODE.MANUAL)}
                                    disabled={isBusy}
                                >
                                    Manual
                                </Button>
                            </Stack>
                        </Box>

                        <Accordion 
                            expanded={manualExpanded} 
                            onChange={(_, isExp) => setManualExpanded(isExp)}
                            elevation={0}
                            sx={{ 
                                bgcolor: 'transparent',
                                opacity: globalMode === WORK_MODE.SELF_CONSUMPTION ? 0.5 : 1,
                                transition: 'opacity 0.2s',
                                '&:before': { display: 'none' }
                            }}
                        >
                            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 0, minHeight: 'auto', '& .MuiAccordionSummary-content': { my: 1 } }}>
                                <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
                                    MANUAL MODE CONFIGURATION
                                </Typography>
                            </AccordionSummary>
                            <AccordionDetails sx={{ px: 0, pb: 0 }}>
                                <Box mb={3}>
                                    {
                                        upsSetting && (
                                            <Alert severity="info" sx={{ mb: 2, py: 0 }}>
                                                What the vendor app exposes as "UPS Mode" is actually just a special case of the manual schedule.<br/>
                                                <br/>
                                                Specifically, if enabled, the system will charge the battery with the specified power as soon as a Grid connection is available.
                                                This overrides any other configured manual schedule items and requires the Backup Power setting to be enabled to make sense.
                                            </Alert>
                                        )
                                    }

                                    {upsSetting && (
                                        <ScheduleItemUI 
                                            setting={upsSetting} 
                                            disabled={isBusy || globalMode === WORK_MODE.SELF_CONSUMPTION} 
                                            isSaving={isBusy && busySlotIndex === upsSetting.slotIndex}
                                            isUpsSlot={true}
                                            minPower={scheduleItemMinPower}
                                            maxPower={scheduleItemMaxPower}
                                            onSave={saveSlotConfig} 
                                        />
                                    )}
                                </Box>

                                <Box>
                                    <Typography variant="subtitle2" color="text.secondary" fontWeight="bold" mb={2}>
                                        SCHEDULE ITEMS ({renderableSchedules.length}/9)
                                    </Typography>

                                    <Alert severity="info" sx={{ mb: 2, py: 0 }}>
                                        Anything here only really makes sense if the Battery has a synced time.
                                        However, as of now, I do not know how that time sync even works
                                        <br/>
                                        So this part is kinda useless.
                                    </Alert>

                                    <Stack spacing={2} mb={2}>
                                        {renderableSchedules.length === 0 ? (
                                            <Typography variant="body2" color="text.disabled" textAlign="center" py={2} fontStyle="italic">
                                                No schedule items configured.
                                            </Typography>
                                        ) : (
                                            renderableSchedules.map(setting => (
                                                <ScheduleItemUI 
                                                    key={setting.slotIndex} 
                                                    setting={setting} 
                                                    disabled={isBusy || isUpsActive || globalMode === WORK_MODE.SELF_CONSUMPTION} 
                                                    isSaving={isBusy && busySlotIndex === setting.slotIndex}
                                                    minPower={scheduleItemMinPower}
                                                    maxPower={scheduleItemMaxPower}
                                                    onSave={saveSlotConfig}
                                                    onDelete={handleDelete}
                                                />
                                            ))
                                        )}
                                    </Stack>

                                    <Button 
                                        variant="outlined" 
                                        startIcon={<AddCircleOutlineIcon />} 
                                        fullWidth 
                                        onClick={handleAdd}
                                        disabled={isBusy || isUpsActive || globalMode === WORK_MODE.SELF_CONSUMPTION || renderableSchedules.length >= 9}
                                        sx={{ borderStyle: 'dashed' }}
                                    >
                                        Add Schedule Item
                                    </Button>
                                </Box>
                            </AccordionDetails>
                        </Accordion>
                    </Stack>
                )}
            </Box>
        </Paper>
    );
};
