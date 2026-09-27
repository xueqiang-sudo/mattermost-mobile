// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentChannelId, getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    fetchProductionLines,
    fetchMESPlans,
    createMESPlan,
    updateMESPlan,
    deleteMESPlan,
    fetchRecordsByChannel,
    fetchRecordWithSteps,
    fetchLineInfo,
    updateLineInfo,
    getDashboardAccess,
    type ProductionLine,
    type MESPlan,
    type MESPlanInput,
    type MESRecord,
    type MESRecordStep,
    type DashboardAccess,
} from '../api';

// ---- Constants ----

const STEP_ICONS: Record<number, string> = {
    1: '🧵', 2: '🔵', 3: '🟡', 4: '🟢',
    5: '🔴', 6: '🟣', 7: '🟠', 8: '⚪',
};

const SPEC_OPTIONS = [
    '75/36', '89/36', '133/36', '140/36', '150/36',
    '162/48', '178/72', '222/40', '222/48', '278/36',
];

// ---- Helpers ----

function formatDateTime(val: string): string {
    if (!val) return '-';
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${mi}`;
}

function formatTimeStr(timeStr: string): string {
    if (!timeStr) return '-';
    return timeStr.replace('T', ' ');
}

function calcDuration(startTime: string, endTime: string): string {
    if (!startTime || !endTime) return '-';
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return '-';
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return '-';
    const days = diffMs / (1000 * 60 * 60 * 24);
    if (days < 1) {
        const hours = diffMs / (1000 * 60 * 60);
        return `${hours.toFixed(1)} h`;
    }
    return `${days.toFixed(2)} d`;
}

function getTodayStr(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getNowLocalStr(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    refreshBtn: {
        padding: 8,
    },
    tabBar: {
        flexDirection: 'row',
        backgroundColor: theme.centerChannelBg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    tabActive: {
        borderBottomColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    tabTextActive: {
        color: theme.buttonBg,
    },
    tabCount: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        marginLeft: 4,
    },
    content: {
        flex: 1,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    dateInput: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        paddingHorizontal: 8,
        paddingVertical: 6,
        color: theme.centerChannelColor,
        ...typography('Body', 75),
    },
    clearBtn: {
        padding: 6,
    },
    addBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    addBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 75, 'SemiBold'),
    },
    btnSecondary: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    btnSecondaryText: {
        color: theme.centerChannelColor,
        ...typography('Body', 75),
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        paddingVertical: 48,
        paddingHorizontal: 24,
    },
    // Plan table
    planCard: {
        marginHorizontal: 12,
        marginVertical: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        padding: 12,
    },
    planRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 2,
    },
    planLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        width: 60,
    },
    planValue: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        flex: 1,
    },
    planLineId: {
        ...typography('Heading', 400, 'Bold'),
        color: theme.buttonBg,
    },
    planActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginTop: 8,
    },
    actionBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    actionBtnDanger: {
        borderColor: theme.errorTextColor,
    },
    actionBtnText: {
        ...typography('Body', 50),
        color: theme.centerChannelColor,
    },
    actionBtnDangerText: {
        color: theme.errorTextColor,
    },
    // Form
    formOverlay: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    formContainer: {
        padding: 16,
    },
    formField: {
        marginBottom: 12,
    },
    formLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 4,
    },
    formInput: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    formActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        paddingTop: 16,
    },
    // Record row
    recordCard: {
        marginHorizontal: 12,
        marginVertical: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        padding: 12,
    },
    stepBadge: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
        overflow: 'hidden',
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
    },
    modalContent: {
        backgroundColor: theme.centerChannelBg,
        marginHorizontal: 16,
        borderRadius: 12,
        maxHeight: '80%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    modalTitle: {
        ...typography('Heading', 300, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    modalCloseBtn: {
        padding: 4,
    },
    modalBody: {
        padding: 16,
    },
    // Summary
    summarySection: {
        marginBottom: 16,
    },
    summarySectionTitle: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
        paddingBottom: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    summaryGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    summaryItem: {
        width: '47%',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 6,
        padding: 8,
    },
    summaryLabel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    summaryValue: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginTop: 2,
    },
    // Step table in detail modal
    stepRow: {
        flexDirection: 'row',
        paddingVertical: 8,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
        alignItems: 'center',
    },
    stepRowPending: {
        opacity: 0.4,
    },
    stepCol: {
        flex: 1,
        ...typography('Body', 75),
        color: theme.centerChannelColor,
    },
    stepColSmall: {
        flex: 0.7,
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    // Line info
    lineInfoEditor: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 4,
        padding: 12,
        color: theme.centerChannelColor,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        fontSize: 12,
        lineHeight: 20,
        minHeight: 300,
        textAlignVertical: 'top',
    },
    saveMsg: {
        ...typography('Body', 75),
        paddingVertical: 4,
    },
}));

// ---- PlanForm Component ----

type PlanFormProps = {
    initial: MESPlanInput;
    lines: ProductionLine[];
    isEdit: boolean;
    onSave: (plan: MESPlanInput) => void;
    onCancel: () => void;
    style: ReturnType<typeof getStyleSheet>;
};

const PlanForm = ({initial, lines, isEdit, onSave, onCancel, style}: PlanFormProps) => {
    const intl = useIntl();
    const [form, setForm] = useState<MESPlanInput>(initial);

    const set = (key: keyof MESPlanInput, val: string) => {
        setForm((prev) => ({...prev, [key]: val}));
    };

    const selectedLine = lines.find((l) => l.id === form.line_id);

    return (
        <ScrollView style={style.formOverlay} contentContainerStyle={style.formContainer}>
            <View style={style.formField}>
                <Text style={style.formLabel}>{intl.formatMessage({id: 'mes.plan_line', defaultMessage: 'Line'})}</Text>
                {lines.length > 0 ? (
                    <ScrollView style={{maxHeight: 150}}>
                        {lines.map((l) => (
                            <TouchableOpacity
                                key={l.id}
                                onPress={() => set('line_id', l.id)}
                                style={{paddingVertical: 8, paddingHorizontal: 12, borderRadius: 4, backgroundColor: form.line_id === l.id ? changeOpacity(style.formLabel?.color || '#000', 0.08) : 'transparent'}}
                            >
                                <Text style={[style.formInput, {borderWidth: 0, padding: 0, backgroundColor: 'transparent'}]}>
                                    {l.id} ({l.positions}pos/{l.spindles}sp)
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                ) : (
                    <TextInput
                        style={style.formInput}
                        value={form.line_id}
                        onChangeText={(v) => set('line_id', v)}
                        placeholder='A1'
                    />
                )}
            </View>
            <View style={style.formField}>
                <Text style={style.formLabel}>{intl.formatMessage({id: 'mes.plan_positions', defaultMessage: 'Positions'})}</Text>
                <TextInput style={style.formInput} value={form.positions} onChangeText={(v) => set('positions', v)} keyboardType='numeric'/>
            </View>
            <View style={style.formField}>
                <Text style={style.formLabel}>{intl.formatMessage({id: 'mes.plan_current_product', defaultMessage: 'Product'})}</Text>
                <TextInput style={style.formInput} value={form.current_product} onChangeText={(v) => set('current_product', v)}/>
            </View>
            <View style={style.formField}>
                <Text style={style.formLabel}>{intl.formatMessage({id: 'mes.plan_spec', defaultMessage: 'Spec'})}</Text>
                <ScrollView horizontal={true} showsHorizontalScrollIndicator={false}>
                    <View style={{flexDirection: 'row', gap: 6}}>
                        {SPEC_OPTIONS.map((s) => (
                            <TouchableOpacity
                                key={s}
                                onPress={() => set('spec', s)}
                                style={{paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: form.spec === s ? '#000' : '#ccc', backgroundColor: form.spec === s ? '#eee' : '#fff'}}
                            >
                                <Text style={{fontSize: 12}}>{s}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>
            </View>
            <View style={style.formField}>
                <Text style={style.formLabel}>{intl.formatMessage({id: 'mes.plan_start_time', defaultMessage: 'Start Time'})}</Text>
                <TextInput style={style.formInput} value={form.start_time} onChangeText={(v) => set('start_time', v)} placeholder='YYYY-MM-DD HH:mm'/>
            </View>
            <View style={style.formField}>
                <Text style={style.formLabel}>{intl.formatMessage({id: 'mes.plan_end_time', defaultMessage: 'Planned End Time'})}</Text>
                <TextInput style={style.formInput} value={form.planned_end_time} onChangeText={(v) => set('planned_end_time', v)} placeholder='YYYY-MM-DD HH:mm'/>
            </View>
            <View style={style.formField}>
                <Text style={style.formLabel}>{intl.formatMessage({id: 'mes.plan_schedule', defaultMessage: 'Schedule'})}</Text>
                <TextInput style={style.formInput} value={form.schedule} onChangeText={(v) => set('schedule', v)}/>
            </View>
            <View style={style.formField}>
                <Text style={style.formLabel}>{intl.formatMessage({id: 'mes.plan_remarks', defaultMessage: 'Remarks'})}</Text>
                <TextInput style={style.formInput} value={form.remarks} onChangeText={(v) => set('remarks', v)}/>
            </View>
            <View style={style.formActions}>
                <TouchableOpacity style={style.btnSecondary} onPress={onCancel}>
                    <Text style={style.btnSecondaryText}>{intl.formatMessage({id: 'mes.cancel', defaultMessage: 'Cancel'})}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={style.addBtn} onPress={() => onSave(form)}>
                    <Text style={style.addBtnText}>{intl.formatMessage({id: 'mes.save', defaultMessage: 'Save'})}</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

// ---- Main Screen ----

const MesScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const style = getStyleSheet(theme);

    const [teamId, setTeamId] = useState('');
    const [channelId, setChannelId] = useState('');
    const [loading, setLoading] = useState(true);

    // Permissions
    const [mesPerms, setMesPerms] = useState({canCreatePlan: false, canViewPlan: false, canCreateLineInfo: false});

    // Data
    const [lines, setLines] = useState<ProductionLine[]>([]);
    const [plans, setPlans] = useState<MESPlan[]>([]);
    const [records, setRecords] = useState<MESRecord[]>([]);
    const [lineInfoContent, setLineInfoContent] = useState('');
    const [lineInfoSaving, setLineInfoSaving] = useState(false);
    const [lineInfoMsg, setLineInfoMsg] = useState<{type: 'success' | 'error'; text: string} | null>(null);

    // Tab
    const [activeTab, setActiveTab] = useState<'plan' | 'records' | 'lines'>('records');

    // Date filter
    const [filterDate, setFilterDate] = useState(getTodayStr);

    // Plan form
    const [showForm, setShowForm] = useState(false);
    const [editingPlanId, setEditingPlanId] = useState(-1);

    // Modals
    const [detailRecord, setDetailRecord] = useState<MESRecord | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [summaryRecord, setSummaryRecord] = useState<MESRecord | null>(null);
    const [summaryPlannedEnd, setSummaryPlannedEnd] = useState('');
    const [summaryLoading, setSummaryLoading] = useState(false);

    // Init: load team/channel IDs
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const [tid, cid] = await Promise.all([getCurrentTeamId(database), getCurrentChannelId(database)]);
                setTeamId(tid);
                setChannelId(cid);
            } catch {
                // ignore
            }
        };
        init();
    }, [serverUrl]);

    // Load permissions
    useEffect(() => {
        if (!teamId) return;
        getDashboardAccess(serverUrl, teamId).then((access) => {
            setMesPerms({
                canCreatePlan: access.mes_create_plan === true,
                canViewPlan: access.mes_view_plan === true,
                canCreateLineInfo: access.mes_create_line_info === true,
            });
            // Auto-select first available tab
            if (access.mes_view_plan) {
                setActiveTab('plan');
            }
        }).catch(() => {});
    }, [serverUrl, teamId]);

    // Load data
    const loadData = useCallback(async () => {
        if (!teamId) return;
        setLoading(true);
        try {
            const [linesData, plansData, lineInfoData] = await Promise.all([
                fetchProductionLines(serverUrl).catch(() => [] as ProductionLine[]),
                fetchMESPlans(serverUrl, teamId).catch(() => [] as MESPlan[]),
                fetchLineInfo(serverUrl, teamId).catch(() => ({content: ''})),
            ]);
            setLines(linesData);
            setPlans(plansData);
            setLineInfoContent(lineInfoData.content || '');

            if (channelId) {
                const recordsData = await fetchRecordsByChannel(serverUrl, teamId, channelId).catch(() => [] as MESRecord[]);
                setRecords(recordsData);
            }
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId, channelId]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Filtered data
    const filteredPlans = useMemo(() => {
        if (!filterDate) return plans;
        return plans.filter((p) => p.start_time?.startsWith(filterDate));
    }, [plans, filterDate]);

    const filteredRecords = useMemo(() => {
        if (!filterDate) return records;
        return records.filter((r) => {
            if (!r.create_at) return false;
            const d = new Date(r.create_at);
            return d.toISOString().startsWith(filterDate);
        });
    }, [records, filterDate]);

    // Sort records by create_at desc
    const sortedRecords = useMemo(() => {
        return [...filteredRecords].sort((a, b) => (b.create_at || 0) - (a.create_at || 0));
    }, [filteredRecords]);

    // ---- Plan CRUD ----

    const handleAddPlan = useCallback(() => {
        setEditingPlanId(-1);
        setShowForm(true);
    }, []);

    const handleEditPlan = useCallback((plan: MESPlan) => {
        setEditingPlanId(plan.id);
        setShowForm(true);
    }, []);

    const handleDeletePlan = useCallback((plan: MESPlan) => {
        Alert.alert(
            intl.formatMessage({id: 'mes.delete_confirm', defaultMessage: 'Delete this plan?'}),
            '',
            [
                {text: intl.formatMessage({id: 'mes.cancel', defaultMessage: 'Cancel'}), style: 'cancel'},
                {
                    text: intl.formatMessage({id: 'mobile.post.delete_confirm', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: async () => {
                        await deleteMESPlan(serverUrl, teamId, plan.id);
                        loadData();
                    },
                },
            ],
        );
    }, [serverUrl, teamId, intl, loadData]);

    const handleSavePlan = useCallback(async (formPlan: MESPlanInput) => {
        if (!formPlan.line_id) {
            Alert.alert('', intl.formatMessage({id: 'mes.select_line', defaultMessage: 'Select Line'}));
            return;
        }
        try {
            if (editingPlanId >= 0) {
                await updateMESPlan(serverUrl, teamId, editingPlanId, formPlan);
            } else {
                await createMESPlan(serverUrl, teamId, formPlan);
            }
            setShowForm(false);
            setEditingPlanId(-1);
            loadData();
        } catch (err) {
            Alert.alert('', `${intl.formatMessage({id: 'mes.save_failed', defaultMessage: 'Save failed'})}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }, [serverUrl, teamId, editingPlanId, intl, loadData]);

    // ---- Record modals ----

    const handleDetail = useCallback(async (recordId: number) => {
        setDetailLoading(true);
        try {
            const record = await fetchRecordWithSteps(serverUrl, teamId, recordId);
            setDetailRecord(record);
        } catch {
            // ignore
        } finally {
            setDetailLoading(false);
        }
    }, [serverUrl, teamId]);

    const handleSummary = useCallback(async (recordId: number) => {
        setSummaryLoading(true);
        try {
            const record = await fetchRecordWithSteps(serverUrl, teamId, recordId);
            setSummaryRecord(record);
            if (record.plan_id > 0) {
                const allPlans = await fetchMESPlans(serverUrl, teamId).catch(() => [] as MESPlan[]);
                const plan = allPlans.find((p) => p.id === record.plan_id);
                setSummaryPlannedEnd(plan?.planned_end_time || '');
            } else {
                setSummaryPlannedEnd('');
            }
        } catch {
            // ignore
        } finally {
            setSummaryLoading(false);
        }
    }, [serverUrl, teamId]);

    // ---- Line Info ----

    const handleSaveLineInfo = useCallback(async () => {
        if (!teamId) return;
        setLineInfoSaving(true);
        setLineInfoMsg(null);
        try {
            await updateLineInfo(serverUrl, teamId, lineInfoContent);
            setLineInfoMsg({type: 'success', text: intl.formatMessage({id: 'mes.save_success', defaultMessage: 'Saved successfully'})});
        } catch (err) {
            setLineInfoMsg({type: 'error', text: `${intl.formatMessage({id: 'mes.save_failed', defaultMessage: 'Save failed'})}: ${err instanceof Error ? err.message : String(err)}`});
        } finally {
            setLineInfoSaving(false);
            setTimeout(() => setLineInfoMsg(null), 3000);
        }
    }, [serverUrl, teamId, lineInfoContent, intl]);

    // ---- Render helpers ----

    const renderPlanCard = (plan: MESPlan) => (
        <View key={`${plan.line_id}-${plan.id}`} style={style.planCard}>
            <View style={style.planRow}>
                <Text style={style.planLineId}>{plan.line_id}</Text>
                <Text style={style.planValue}>{plan.current_product || '-'}</Text>
            </View>
            <View style={style.planRow}>
                <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_spec', defaultMessage: 'Spec'})}</Text>
                <Text style={style.planValue}>{plan.spec || '-'} | {plan.positions || '-'} pos</Text>
            </View>
            <View style={style.planRow}>
                <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_start_time', defaultMessage: 'Start'})}</Text>
                <Text style={style.planValue}>{formatDateTime(plan.start_time)}</Text>
            </View>
            <View style={style.planRow}>
                <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_end_time', defaultMessage: 'End'})}</Text>
                <Text style={style.planValue}>{formatDateTime(plan.planned_end_time)}</Text>
            </View>
            {plan.schedule ? (
                <View style={style.planRow}>
                    <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_schedule', defaultMessage: 'Schedule'})}</Text>
                    <Text style={style.planValue} numberOfLines={2}>{plan.schedule}</Text>
                </View>
            ) : null}
            {plan.remarks ? (
                <View style={style.planRow}>
                    <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_remarks', defaultMessage: 'Remarks'})}</Text>
                    <Text style={style.planValue}>{plan.remarks}</Text>
                </View>
            ) : null}
            {mesPerms.canCreatePlan && (
                <View style={style.planActions}>
                    <TouchableOpacity style={style.actionBtn} onPress={() => handleEditPlan(plan)}>
                        <Text style={style.actionBtnText}>✏️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[style.actionBtn, style.actionBtnDanger]} onPress={() => handleDeletePlan(plan)}>
                        <Text style={style.actionBtnDangerText}>🗑️</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );

    const renderRecordCard = (record: MESRecord) => (
        <View key={record.id} style={style.recordCard}>
            <View style={style.planRow}>
                <Text style={style.planLineId}>{record.line_id}</Text>
                <View style={style.stepBadge}>
                    <Text style={{color: theme.buttonBg, ...typography('Body', 50, 'SemiBold')}}>{record.last_step_name || '-'}</Text>
                </View>
            </View>
            <View style={style.planRow}>
                <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_current_product', defaultMessage: 'Product'})}</Text>
                <Text style={style.planValue}>{record.product || '-'} | {record.spec || '-'}</Text>
            </View>
            <View style={style.planRow}>
                <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_operator', defaultMessage: 'Operator'})}</Text>
                <Text style={style.planValue}>{record.operator || '-'}</Text>
            </View>
            <View style={style.planRow}>
                <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_start_time', defaultMessage: 'Start'})}</Text>
                <Text style={style.planValue}>{record.start_time || '-'}</Text>
            </View>
            <View style={style.planRow}>
                <Text style={style.planLabel}>{intl.formatMessage({id: 'mes.plan_allocated', defaultMessage: 'Alloc(kg)'})}</Text>
                <Text style={style.planValue}>{record.allocated_kg > 0 ? `${record.allocated_kg} kg` : '-'} | {record.roll_count > 0 ? `${record.roll_count} rolls` : '-'}</Text>
            </View>
            <View style={style.planActions}>
                <TouchableOpacity style={style.actionBtn} onPress={() => handleDetail(record.id)}>
                    <Text style={style.actionBtnText}>{intl.formatMessage({id: 'mes.detail', defaultMessage: 'Details'})}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={style.actionBtn} onPress={() => handleSummary(record.id)}>
                    <Text style={style.actionBtnText}>{intl.formatMessage({id: 'mes.summary', defaultMessage: 'Summary'})}</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    // ---- Loading state ----

    if (loading) {
        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.header}>
                    <Text style={style.headerTitle}>{intl.formatMessage({id: 'mes.title', defaultMessage: 'MES'})}</Text>
                </View>
                <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                </View>
            </SafeAreaView>
        );
    }

    // ---- Plan form overlay ----

    if (showForm) {
        const initialForm: MESPlanInput = editingPlanId >= 0
            ? (() => {
                const p = plans.find((pl) => pl.id === editingPlanId);
                return p ? {
                    line_id: p.line_id, positions: p.positions, current_product: p.current_product,
                    spec: p.spec, start_time: p.start_time, planned_end_time: p.planned_end_time,
                    schedule: p.schedule, remarks: p.remarks,
                } : {line_id: '', positions: '', current_product: '', spec: '150/36', start_time: getNowLocalStr(), planned_end_time: getNowLocalStr(), schedule: '', remarks: ''};
            })()
            : {line_id: '', positions: '', current_product: '', spec: '150/36', start_time: getNowLocalStr(), planned_end_time: getNowLocalStr(), schedule: '', remarks: ''};

        return (
            <SafeAreaView edges={['top', 'bottom']} style={style.container}>
                <View style={style.header}>
                    <Text style={style.headerTitle}>
                        {editingPlanId >= 0 ? intl.formatMessage({id: 'mes.edit_plan', defaultMessage: 'Edit Plan'}) : intl.formatMessage({id: 'mes.add_plan', defaultMessage: 'Add Plan'})}
                    </Text>
                </View>
                <PlanForm
                    initial={initialForm}
                    lines={lines}
                    isEdit={editingPlanId >= 0}
                    onSave={handleSavePlan}
                    onCancel={() => { setShowForm(false); setEditingPlanId(-1); }}
                    style={style}
                />
            </SafeAreaView>
        );
    }

    // ---- Main render ----

    return (
        <SafeAreaView edges={['top', 'bottom']} style={style.container}>
            {/* Header */}
            <View style={style.header}>
                <Text style={style.headerTitle}>{intl.formatMessage({id: 'mes.title', defaultMessage: 'MES'})}</Text>
                <TouchableOpacity style={style.refreshBtn} onPress={loadData}>
                    <CompassIcon name='refresh' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
            </View>

            {/* Tab bar */}
            <View style={style.tabBar}>
                {mesPerms.canViewPlan && (
                    <TouchableOpacity
                        style={[style.tab, activeTab === 'plan' && style.tabActive]}
                        onPress={() => setActiveTab('plan')}
                    >
                        <Text style={[style.tabText, activeTab === 'plan' && style.tabTextActive]}>
                            {intl.formatMessage({id: 'mes.production_plan', defaultMessage: 'Production Plan'})}
                            {filteredPlans.length > 0 && <Text style={style.tabCount}> ({filteredPlans.length})</Text>}
                        </Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[style.tab, activeTab === 'records' && style.tabActive]}
                    onPress={() => setActiveTab('records')}
                >
                    <Text style={[style.tabText, activeTab === 'records' && style.tabTextActive]}>
                        {intl.formatMessage({id: 'mes.production_records', defaultMessage: 'Records'})}
                        {sortedRecords.length > 0 && <Text style={style.tabCount}> ({sortedRecords.length})</Text>}
                    </Text>
                </TouchableOpacity>
                {mesPerms.canCreateLineInfo && (
                    <TouchableOpacity
                        style={[style.tab, activeTab === 'lines' && style.tabActive]}
                        onPress={() => setActiveTab('lines')}
                    >
                        <Text style={[style.tabText, activeTab === 'lines' && style.tabTextActive]}>
                            {intl.formatMessage({id: 'mes.line_info', defaultMessage: 'Line Info'})}
                        </Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Content */}
            <View style={style.content}>
                {/* Plan or Records toolbar */}
                {(activeTab === 'plan' || activeTab === 'records') && (
                    <View style={style.toolbar}>
                        <TextInput
                            style={style.dateInput}
                            value={filterDate}
                            onChangeText={setFilterDate}
                            placeholder='YYYY-MM-DD'
                        />
                        {filterDate ? (
                            <TouchableOpacity style={style.clearBtn} onPress={() => setFilterDate('')}>
                                <CompassIcon name='close-circle-outline' size={18} color={changeOpacity(theme.centerChannelColor, 0.4)}/>
                            </TouchableOpacity>
                        ) : null}
                        <View style={{flex: 1}}/>
                        {activeTab === 'plan' && mesPerms.canCreatePlan && !showForm && (
                            <TouchableOpacity style={style.addBtn} onPress={handleAddPlan}>
                                <Text style={style.addBtnText}>+ {intl.formatMessage({id: 'mes.add_plan', defaultMessage: 'Add Plan'})}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}

                {/* Plan tab */}
                {activeTab === 'plan' && (
                    <ScrollView>
                        {filteredPlans.length === 0 ? (
                            <Text style={style.emptyText}>
                                {filterDate
                                    ? intl.formatMessage({id: 'mes.no_plans_for_date', defaultMessage: 'No plans for this date.'})
                                    : intl.formatMessage({id: 'mes.no_plan_records', defaultMessage: 'No plans yet.'})}
                            </Text>
                        ) : (
                            filteredPlans.map(renderPlanCard)
                        )}
                    </ScrollView>
                )}

                {/* Records tab */}
                {activeTab === 'records' && (
                    <ScrollView>
                        {sortedRecords.length === 0 ? (
                            <Text style={style.emptyText}>
                                {filterDate
                                    ? intl.formatMessage({id: 'mes.no_records_for_date', defaultMessage: 'No records for this date.'})
                                    : intl.formatMessage({id: 'mes.no_records', defaultMessage: 'No records yet.'})}
                            </Text>
                        ) : (
                            sortedRecords.map(renderRecordCard)
                        )}
                    </ScrollView>
                )}

                {/* Lines tab */}
                {activeTab === 'lines' && (
                    <ScrollView style={{padding: 16}}>
                        {mesPerms.canCreateLineInfo && (
                            <View style={{flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12}}>
                                <TouchableOpacity style={style.addBtn} onPress={handleSaveLineInfo} disabled={lineInfoSaving}>
                                    <Text style={style.addBtnText}>
                                        {lineInfoSaving ? '...' : '💾'} {intl.formatMessage({id: 'mes.save', defaultMessage: 'Save'})}
                                    </Text>
                                </TouchableOpacity>
                                {lineInfoMsg && (
                                    <Text style={[style.saveMsg, {color: lineInfoMsg.type === 'success' ? '#2ea043' : theme.errorTextColor}]}>
                                        {lineInfoMsg.text}
                                    </Text>
                                )}
                            </View>
                        )}
                        <TextInput
                            style={style.lineInfoEditor}
                            value={lineInfoContent}
                            onChangeText={setLineInfoContent}
                            editable={mesPerms.canCreateLineInfo}
                            multiline={true}
                            placeholder={intl.formatMessage({id: 'mes.line_info_placeholder', defaultMessage: 'Enter line info...'})}
                        />
                    </ScrollView>
                )}
            </View>

            {/* Detail Modal */}
            <Modal visible={Boolean(detailRecord)} transparent={true} animationType='fade' onRequestClose={() => setDetailRecord(null)}>
                <View style={style.modalOverlay}>
                    <View style={style.modalContent}>
                        <View style={style.modalHeader}>
                            <Text style={style.modalTitle}>
                                {detailRecord?.line_id} / {detailRecord?.product} — {intl.formatMessage({id: 'mes.detail', defaultMessage: 'Details'})}
                            </Text>
                            <TouchableOpacity style={style.modalCloseBtn} onPress={() => setDetailRecord(null)}>
                                <CompassIcon name='close' size={20} color={theme.centerChannelColor}/>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={style.modalBody}>
                            {/* Step table header */}
                            <View style={[style.stepRow, {borderBottomWidth: 1}]}>
                                <Text style={[style.stepCol, {fontWeight: 'bold'}]}>{intl.formatMessage({id: 'mes.plan_step', defaultMessage: 'Step'})}</Text>
                                <Text style={style.stepCol}>{intl.formatMessage({id: 'mes.plan_operator', defaultMessage: 'Operator'})}</Text>
                                <Text style={style.stepColSmall}>{intl.formatMessage({id: 'mes.plan_time', defaultMessage: 'Time'})}</Text>
                                <Text style={style.stepCol}>{intl.formatMessage({id: 'mes.plan_notes', defaultMessage: 'Notes'})}</Text>
                            </View>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => {
                                const stepEntry = detailRecord?.steps?.find((st) => st.step === s);
                                const done = Boolean(stepEntry);
                                let stepNotes = '';
                                if (stepEntry?.step_data) {
                                    try { stepNotes = JSON.parse(stepEntry.step_data).notes || ''; } catch { /* ignore */ }
                                }
                                return (
                                    <View key={s} style={[style.stepRow, !done && style.stepRowPending]}>
                                        <Text style={style.stepCol}>
                                            {STEP_ICONS[s] || '📋'} {done ? stepEntry!.step_name : `Step ${s}`}
                                        </Text>
                                        <Text style={style.stepCol}>{done ? stepEntry!.operator : '-'}</Text>
                                        <Text style={style.stepColSmall}>
                                            {done && stepEntry!.create_at ? formatDateTime(new Date(stepEntry!.create_at).toISOString()) : '-'}
                                        </Text>
                                        <Text style={style.stepCol}>{done ? (stepNotes || '-') : '-'}</Text>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Detail loading */}
            <Modal visible={detailLoading} transparent={true}>
                <View style={[style.modalOverlay, {alignItems: 'center', justifyContent: 'center'}]}>
                    <ActivityIndicator size='large' color='#fff'/>
                </View>
            </Modal>

            {/* Summary Modal */}
            <Modal visible={Boolean(summaryRecord)} transparent={true} animationType='fade' onRequestClose={() => setSummaryRecord(null)}>
                <View style={style.modalOverlay}>
                    <View style={style.modalContent}>
                        <View style={style.modalHeader}>
                            <Text style={style.modalTitle}>
                                {summaryRecord?.line_id} / {summaryRecord?.product} — {intl.formatMessage({id: 'mes.summary', defaultMessage: 'Summary'})}
                            </Text>
                            <TouchableOpacity style={style.modalCloseBtn} onPress={() => setSummaryRecord(null)}>
                                <CompassIcon name='close' size={20} color={theme.centerChannelColor}/>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={style.modalBody}>
                            {summaryRecord && (
                                <>
                                    {/* Basic Info */}
                                    <View style={style.summarySection}>
                                        <Text style={style.summarySectionTitle}>{intl.formatMessage({id: 'mes.summary_basic', defaultMessage: 'Basic Info'})}</Text>
                                        <View style={style.summaryGrid}>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.plan_line', defaultMessage: 'Line'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.line_id}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.plan_current_product', defaultMessage: 'Product'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.product || '-'}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.plan_spec', defaultMessage: 'Spec'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.spec || '-'}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.plan_positions', defaultMessage: 'Positions'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.positions || '-'}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Time */}
                                    <View style={style.summarySection}>
                                        <Text style={style.summarySectionTitle}>{intl.formatMessage({id: 'mes.summary_time', defaultMessage: 'Time'})}</Text>
                                        <View style={style.summaryGrid}>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.plan_start_time', defaultMessage: 'Start'})}</Text>
                                                <Text style={style.summaryValue}>{formatTimeStr(summaryRecord.start_time)}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_planned_end', defaultMessage: 'Planned End'})}</Text>
                                                <Text style={style.summaryValue}>{formatTimeStr(summaryPlannedEnd)}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_estimated_end', defaultMessage: 'Estimated End'})}</Text>
                                                <Text style={style.summaryValue}>{formatTimeStr(summaryRecord.estimated_end_time)}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_duration', defaultMessage: 'Duration'})}</Text>
                                                <Text style={style.summaryValue}>{calcDuration(summaryRecord.start_time, summaryRecord.end_time)}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Output */}
                                    <View style={style.summarySection}>
                                        <Text style={style.summarySectionTitle}>{intl.formatMessage({id: 'mes.summary_output', defaultMessage: 'Output'})}</Text>
                                        <View style={style.summaryGrid}>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.plan_allocated', defaultMessage: 'Alloc(kg)'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.allocated_kg > 0 ? `${summaryRecord.allocated_kg} kg` : '-'}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_actual_output', defaultMessage: 'Actual Output'})}</Text>
                                                <Text style={style.summaryValue}>
                                                    {summaryRecord.actual_output_kg > 0 ? `${summaryRecord.actual_output_kg} kg` : (summaryRecord.qc_qualified_kg > 0 ? `${summaryRecord.qc_qualified_kg} kg` : '-')}
                                                </Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.plan_rolls', defaultMessage: 'Rolls'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.roll_count > 0 ? `${summaryRecord.roll_count}` : '-'}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_waste', defaultMessage: 'Waste'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.waste_kg > 0 ? `${summaryRecord.waste_kg} kg` : '-'}</Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Quality */}
                                    <View style={style.summarySection}>
                                        <Text style={style.summarySectionTitle}>{intl.formatMessage({id: 'mes.summary_quality', defaultMessage: 'Quality'})}</Text>
                                        <View style={style.summaryGrid}>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_breakage', defaultMessage: 'Breakage'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.breakage_count > 0 ? `${summaryRecord.breakage_count}` : '-'}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_small_roll', defaultMessage: 'Small Rolls'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.small_roll_count > 0 ? `${summaryRecord.small_roll_count}` : '-'}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_fuzz', defaultMessage: 'Fuzz Defects'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.fuzz_defect_count > 0 ? `${summaryRecord.fuzz_defect_count}` : '-'}</Text>
                                            </View>
                                            <View style={style.summaryItem}>
                                                <Text style={style.summaryLabel}>{intl.formatMessage({id: 'mes.summary_color_uneven', defaultMessage: 'Color Uneven'})}</Text>
                                                <Text style={style.summaryValue}>{summaryRecord.color_uneven_count > 0 ? `${summaryRecord.color_uneven_count}` : '-'}</Text>
                                            </View>
                                        </View>
                                    </View>
                                </>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Summary loading */}
            <Modal visible={summaryLoading} transparent={true}>
                <View style={[style.modalOverlay, {alignItems: 'center', justifyContent: 'center'}]}>
                    <ActivityIndicator size='large' color='#fff'/>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default MesScreen;
