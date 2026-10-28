// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 离线出库/入库扫描 Screen
 * - 扫码后本地存储记录
 * - 支持日期/时段筛选、人工输入、删除、批量上传
 * - 调用 frappe-sync 插件 API (/api/pick-list)
 */

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {Screens} from '@constants';
import {MESSAGE_TYPE, SNACK_BAR_TYPE} from '@constants/snack_bar';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AppsStackParamList} from '../apps_stack_param_list';

import {parseQrCode} from './scan_utils';
import {
    addScanRecord,
    getScanRecords,
    deleteScanRecords,
    updateScanRecordStatus,
    getDistinctScanDates,
    getDistinctScanSessions,
    createCurrentSession,
    createCurrentDate,
    type ScanRecord,
} from './scan_database';

type ScanType = 'stock_in' | 'stock_out';

function formatDisplayBarcode(item: ScanRecord): string {
    // netWeight 存储的是 kg 值，需要乘以 100 转换为整数格式
    const weightValue = (item.netWeight || 0) * 100;
    const weightRounded = Math.round(weightValue);
    const weightStr = String(weightRounded).padStart(6, '0');


    if (item.isMasterSheet) {
        // 总码单: 9 + 11位码单号 + 2位箱数 + 6位净重
        const boxStr = String(item.boxNo || '0').padStart(2, '0');
        return `9${item.codeSheetNo}${boxStr}${weightStr}`;
    }
    // 箱单: 11位码单号 + "01"(永远是1箱) + 6位净重
    return `${item.codeSheetNo}01${weightStr}`;
}

const WarehouseInoutScreen = () => {
    const intl = useIntl();
    const navigation = useNavigation();
    const route = useRoute<RouteProp<AppsStackParamList, typeof Screens.APPS_WAREHOUSE_INOUT>>();
    const initialScanType = (route.params?.initialScanType || 'stock_out') as ScanType;
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    // ── State ──
    const [scanType] = useState<ScanType>(initialScanType);
    const [scanDate, setScanDate] = useState(createCurrentDate());
    const [scanSession, setScanSession] = useState('');
    const [records, setRecords] = useState<ScanRecord[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [, setCurrentBarcode] = useState(''); // 值不再展示，仅保留 setter 兼容扫描流程
    const [showManualInput, setShowManualInput] = useState(false);
    const [manualInputText, setManualInputText] = useState('');
    const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
    const [sessionDropdownOpen, setSessionDropdownOpen] = useState(false);
    const [availableDates, setAvailableDates] = useState<string[]>([]);
    const [availableSessions, setAvailableSessions] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [showPickListModal, setShowPickListModal] = useState(false);
    const [pendingPickLists, setPendingPickLists] = useState<{name: string; customer_name?: string}[]>([]);
    const [selectedPickList, setSelectedPickList] = useState('');
    const [pickListDropdownOpen, setPickListDropdownOpen] = useState(false);
    const [isLoadingPickLists, setIsLoadingPickLists] = useState(false);

    const title = scanType === 'stock_out'
        ? intl.formatMessage({id: 'warehouse_inout.outbound_scan', defaultMessage: '出库'})
        : intl.formatMessage({id: 'warehouse_inout.inbound_scan', defaultMessage: '离线入库扫描'});

    // ── Load data ──
    const loadRecords = useCallback(async () => {
        const list = await getScanRecords({scanType, scanDate, scanSession});
        setRecords(list);
    }, [scanType, scanDate, scanSession]);

    const loadDropdowns = useCallback(async () => {
        const dates = await getDistinctScanDates(scanType);
        if (!dates.includes(scanDate)) {
            dates.unshift(scanDate);
        }
        setAvailableDates(dates);

        const sessions = await getDistinctScanSessions(scanDate, scanType);
        if (!sessions.includes(scanSession)) {
            sessions.unshift(scanSession);
        }
        setAvailableSessions(sessions);
    }, [scanType, scanDate, scanSession]);

    useEffect(() => {
        const init = async () => {
            // 进入页面不创建新 session、不累加，只展示该日期已有记录和下拉。
            // session 默认选中该日期最近一次（若有），没有则为空。点「新扫描」才创建。
            const sessions = await getDistinctScanSessions(scanDate, scanType);
            const initialSession = sessions.length > 0 ? sessions[0] : '';
            setScanSession(initialSession);

            // 展示该日期该 session 的历史记录（session 为空时展示该日期全部）
            const list = await getScanRecords({scanType, scanDate, scanSession: initialSession || undefined});
            setRecords(list);

            const dates = await getDistinctScanDates(scanType);
            if (!dates.includes(scanDate)) {
                dates.unshift(scanDate);
            }
            setAvailableDates(dates);
            setAvailableSessions(sessions);
        };
        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Stats ──
    const stats = useMemo(() => {
        const totalBarcodes = records.length;
        const totalBoxes = records.reduce((sum, r) => {
            if (r.isMasterSheet) {
                // 总码单: boxNo 是总箱数
                const boxNum = parseInt(r.boxNo, 10);
                return sum + (isNaN(boxNum) ? 1 : boxNum);
            }
            // 箱单: 每条记录就是1箱
            return sum + 1;
        }, 0);
        const totalWeight = records.reduce((sum, r) => sum + (r.netWeight || 0), 0);
        return {totalBarcodes, totalBoxes, totalWeight: totalWeight.toFixed(2)};
    }, [records]);

    const pendingCount = useMemo(() => records.filter((r) => r.status === 'pending' || r.status === 'failed').length, [records]);

    // ── Scan handler ──
    const handleScanResult = useCallback(async (raw: string, sessionOverride?: string) => {
        const parsed = parseQrCode(raw);
        if (!parsed) {
            return;
        }

        // 连续扫描时用传入的 session（state 更新是异步的，不能依赖 scanSession）
        const targetSession = sessionOverride || scanSession;

        const displayBarcode = formatDisplayBarcode({
            codeSheetNo: parsed.codeSheetNo,
            boxNo: parsed.boxNo,
            netWeight: parsed.netWeight,
            isMasterSheet: parsed.isMasterSheet,
        } as ScanRecord);

        // 检查本 session 是否已扫描过相同的条形码（从数据库查，避免闭包里 records 过期）
        const sessionRecords = await getScanRecords({scanType, scanDate, scanSession: targetSession});
        const isDuplicate = sessionRecords.some((r) =>
            r.codeSheetNo === parsed.codeSheetNo &&
            r.boxNo === parsed.boxNo &&
            r.isMasterSheet === parsed.isMasterSheet,
        );

        if (isDuplicate) {
            // 只显示提示，不存入数据库
            setCurrentBarcode(`${displayBarcode} (${intl.formatMessage({
                id: 'warehouse_inout.duplicate_scan',
                defaultMessage: '已扫描',
            })})`);
            showSnackBar({
                barType: SNACK_BAR_TYPE.DEFAULT,
                customMessage: intl.formatMessage({
                    id: 'warehouse_inout.duplicate_scan_msg',
                    defaultMessage: '该条形码已在当前单号中扫描过',
                }),
                type: MESSAGE_TYPE.WARNING,
            });
            return;
        }

        setCurrentBarcode(displayBarcode);

        await addScanRecord({
            scanType,
            codeSheetNo: parsed.codeSheetNo,
            boxNo: parsed.boxNo,
            netWeight: parsed.netWeight,
            rawScan: raw,
            isMasterSheet: parsed.isMasterSheet,
            scanDate,
            scanSession: targetSession,
            status: 'pending',
        });

        // 用 targetSession 重新加载，保证连续扫描时列表实时累加
        const updated = await getScanRecords({scanType, scanDate, scanSession: targetSession});
        setRecords(updated);
        await loadDropdowns();
    }, [scanType, scanDate, scanSession, loadDropdowns, intl]);

    const openScanner = useCallback(async () => {
        // 「新扫描」：创建新 session（当前日期独立序号 +1，如 01→02），再打开连续扫描。
        const newSession = await createCurrentSession(scanDate, scanType);
        setScanSession(newSession);
        setCurrentBarcode('');

        // 新 session 加入下拉（置顶）
        setAvailableSessions((prev) => (prev.includes(newSession) ? prev : [newSession, ...prev]));

        showQrScannerModal(intl, {
            continuousScan: true, // 连续扫描，用户自己关闭摄像头
            onScanResultCallback: (value: string) => {
                handleScanResult(value, newSession);
                return true; // 连续模式下返回值不触发关闭
            },
        });
    }, [intl, handleScanResult, scanDate, scanType]);

    // ── Manual input ──
    const handleManualInput = useCallback(async () => {
        const input = manualInputText.trim();
        if (!input) {
            return;
        }

        // Parse formatted barcode:
        // Master (starts with 9): 9 + 11位码单号 + 2位箱数 + 6位净重 = 20 chars
        // Single box:             11位码单号 + 2位箱号 + 6位净重 = 19 chars
        let codeSheetNo: string;
        let boxNo: string;
        let netWeight: number;
        let isMaster: boolean;

        if (input.startsWith('9') && input.length >= 20) {
            isMaster = true;
            codeSheetNo = input.substring(1, 12);
            boxNo = input.substring(12, 14);
            const weightStr = input.substring(14, 20);
            netWeight = parseInt(weightStr, 10) / 100;
        } else if (input.length >= 19) {
            isMaster = false;
            codeSheetNo = input.substring(0, 11);
            boxNo = input.substring(11, 13);
            const weightStr = input.substring(13, 19);
            netWeight = parseInt(weightStr, 10) / 100;
        } else {
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.invalid_format', defaultMessage: '格式错误'}),
                intl.formatMessage({id: 'warehouse_inout.invalid_format_msg', defaultMessage: '请输入完整的条码数据（总码单20位或单箱19位）'}),
            );
            return;
        }

        const displayBarcode = formatDisplayBarcode({
            codeSheetNo,
            boxNo,
            netWeight,
            isMasterSheet: isMaster,
        } as ScanRecord);

        // 检查本次 session 是否已扫描过相同的条形码
        const isDuplicate = records.some((r) =>
            r.codeSheetNo === codeSheetNo &&
            r.boxNo === boxNo &&
            r.isMasterSheet === isMaster,
        );

        if (isDuplicate) {
            // 只显示提示，不存入数据库
            setCurrentBarcode(`${displayBarcode} (${intl.formatMessage({
                id: 'warehouse_inout.duplicate_scan',
                defaultMessage: '已扫描',
            })})`);
            showSnackBar({
                barType: SNACK_BAR_TYPE.DEFAULT,
                customMessage: intl.formatMessage({
                    id: 'warehouse_inout.duplicate_scan_msg',
                    defaultMessage: '该条形码已在当前单号中扫描过',
                }),
                type: MESSAGE_TYPE.WARNING,
            });
            return;
        }

        setCurrentBarcode(displayBarcode);

        await addScanRecord({
            scanType,
            codeSheetNo,
            boxNo,
            netWeight,
            rawScan: input,
            isMasterSheet: isMaster,
            scanDate,
            scanSession,
            status: 'pending',
        });

        await loadRecords();
        await loadDropdowns();
        setManualInputText('');
        setShowManualInput(false);
    }, [manualInputText, scanType, scanDate, scanSession, intl, loadRecords, loadDropdowns, records]);

    // ── Delete ──
    const handleDelete = useCallback(async () => {
        if (selectedIds.size === 0) {
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.select_first', defaultMessage: '请先选择要删除的条目'}),
            );
            return;
        }

        const confirmed = await new Promise<boolean>((resolve) => {
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.confirm_delete_title', defaultMessage: '确认删除'}),
                intl.formatMessage(
                    {id: 'warehouse_inout.confirm_delete_msg', defaultMessage: '确定要删除选中的 {count} 条记录吗？'},
                    {count: selectedIds.size},
                ),
                [
                    {text: intl.formatMessage({id: 'mobile.cancel', defaultMessage: '取消'}), style: 'cancel', onPress: () => resolve(false)},
                    {text: intl.formatMessage({id: 'warehouse_inout.delete', defaultMessage: '删除'}), style: 'destructive', onPress: () => resolve(true)},
                ],
            );
        });

        if (confirmed) {
            await deleteScanRecords(Array.from(selectedIds));
            setSelectedIds(new Set());
            await loadRecords();
            await loadDropdowns();
        }
    }, [selectedIds, intl, loadRecords, loadDropdowns]);

    // ── Upload: Step 1 - Fetch pending pick lists and show selection modal ──
    const handleUploadStart = useCallback(async () => {
        const pendingRecords = records.filter((r) => r.status === 'pending' || r.status === 'failed');
        if (pendingRecords.length === 0) {
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.nothing_to_upload', defaultMessage: '没有待上传的记录'}),
            );
            return;
        }

        setIsLoadingPickLists(true);
        setShowPickListModal(true);
        setSelectedPickList('');

        try {
            const client = NetworkManager.getClient(serverUrl);
            const result = await client.doFetch(
                '/plugins/com.mattermost.frappe-sync/api/pick-lists/get-pending-pick-lists',
                {method: 'GET'},
            );

            // Check for error in response
            if (result?.error) {
                setPendingPickLists([]);
                Alert.alert(
                    intl.formatMessage({id: 'warehouse_inout.fetch_pick_lists_failed', defaultMessage: '获取拣货单列表失败'}),
                    String(result.error),
                );
                setIsLoadingPickLists(false);
                return;
            }

            const lists: {name: string; customer_name?: string}[] = [];
            // ERPNext returns {pick_lists: ["STO-PICK-...", ...]}
            // MCP wraps as {data: {pick_lists: [...]}}
            const pickLists = result?.data?.pick_lists || result?.pick_lists || result?.message;
            if (Array.isArray(pickLists)) {
                for (const item of pickLists) {
                    if (typeof item === 'string') {
                        lists.push({name: item});
                    } else if (item?.name) {
                        lists.push(item);
                    }
                }
            }
            setPendingPickLists(lists);
        } catch (e: any) {
            setPendingPickLists([]);
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.fetch_pick_lists_failed', defaultMessage: '获取拣货单列表失败'}),
                e?.message || String(e),
            );
        }

        setIsLoadingPickLists(false);
    }, [records, serverUrl, intl]);

    // ── Upload: Step 2 - Upload items to selected pick list ──
    const handleUploadConfirm = useCallback(async () => {
        if (!selectedPickList) {
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.select_pick_list', defaultMessage: '请选择拣货单'}),
            );
            return;
        }

        const pendingRecords = records.filter((r) => r.status === 'pending' || r.status === 'failed');
        if (pendingRecords.length === 0) {
            return;
        }

        setShowPickListModal(false);
        setIsUploading(true);

        const pendingIds = pendingRecords.map((r) => r.id);
        const items = pendingRecords.map((r) => ({
            code_sheet_no: r.codeSheetNo,
            box_no: r.boxNo,
            weight: r.netWeight,
            type: r.isMasterSheet ? 'C' : 'B',
        }));

        let uploadSuccess = false;
        let uploadError = '';

        const requestBody = {
            pick_list: selectedPickList,
            items,
        };

        try {
            const client = NetworkManager.getClient(serverUrl);
            const response = await client.doFetch(
                '/plugins/com.mattermost.frappe-sync/api/pick-lists/add-items-from-scan',
                {
                    method: 'POST',
                    body: requestBody,
                },
            );


            if (response?.error) {
                throw new Error(response.error);
            }

            await updateScanRecordStatus(pendingIds, 'uploaded');
            uploadSuccess = true;
        } catch (e) {
            uploadError = e instanceof Error ? e.message : String(e);
            await updateScanRecordStatus(pendingIds, 'failed');
        }

        setIsUploading(false);
        setSelectedPickList('');
        await loadRecords();

        if (uploadSuccess) {
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.upload_done', defaultMessage: '上传完成'}),
                intl.formatMessage(
                    {id: 'warehouse_inout.upload_done_msg', defaultMessage: '已上传 {count} 条记录到拣货单 {pickList}'},
                    {count: pendingRecords.length, pickList: selectedPickList},
                ),
            );
        } else {
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.upload_failed', defaultMessage: '上传失败'}),
                uploadError || intl.formatMessage({id: 'warehouse_inout.upload_failed_msg', defaultMessage: '上传到拣货单 {pickList} 失败，请重试'}, {pickList: selectedPickList}),
            );
        }
    }, [selectedPickList, records, serverUrl, intl, loadRecords]);

    // ── Toggle selection（复选框只用于删除；已上传记录不可选）──
    const toggleSelect = useCallback((id: string, status: ScanRecord['status']) => {
        if (status === 'uploaded') {
            return; // 已上传记录锁定，不可勾选
        }
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // ── Render list item ──
    const renderRecord = useCallback(({item, index}: {item: ScanRecord; index: number}) => {
        const isSelected = selectedIds.has(item.id);
        const isUploaded = item.status === 'uploaded';

        // 行末状态图标：已上传=绿对勾，失败=红感叹号，待上传=灰空心圈
        const statusIcon = isUploaded ? 'check-circle'
            : item.status === 'failed' ? 'alert-circle-outline'
                : 'check-circle-outline';
        const statusIconColor = isUploaded ? '#4CAF50'
            : item.status === 'failed' ? '#F44336'
                : changeOpacity(theme.centerChannelColor, 0.4);

        return (
            <TouchableOpacity
                style={[styles.listItem, isSelected && styles.listItemSelected]}
                onPress={() => toggleSelect(item.id, item.status)}
                disabled={isUploaded}
            >
                {/* 复选框只用于删除；已上传记录置灰锁定 */}
                <View style={[
                    styles.checkbox,
                    isSelected && styles.checkboxChecked,
                    isUploaded && styles.checkboxLocked,
                ]}>
                    {isSelected && <CompassIcon name='check' size={14} color='#fff'/>}
                    {isUploaded && <CompassIcon name='lock' size={12} color={changeOpacity(theme.centerChannelColor, 0.3)}/>}
                </View>
                <Text style={styles.listIndex}>{index + 1}</Text>
                <View style={styles.listContent}>
                    <Text style={styles.listBarcode} numberOfLines={1}>
                        {formatDisplayBarcode(item)}
                    </Text>
                </View>
                <CompassIcon name={statusIcon} size={20} color={statusIconColor}/>
            </TouchableOpacity>
        );
    }, [selectedIds, theme, styles, toggleSelect]);

    const keyExtractor = useCallback((item: ScanRecord) => item.id, []);

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{title}</Text>
                <TouchableOpacity style={styles.scanBtn} onPress={openScanner}>
                    <Text style={styles.scanBtnText}>
                        {intl.formatMessage({id: 'warehouse_inout.new_scan', defaultMessage: '新扫描'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Date & Session dropdowns */}
            <View style={styles.filterArea}>
                <View style={styles.filterRow}>
                    <Text style={styles.filterLabel}>
                        {intl.formatMessage({id: 'warehouse_inout.scan_date', defaultMessage: '扫描日期'})}
                    </Text>
                    <TouchableOpacity
                        style={styles.selectBtn}
                        onPress={() => {
                            setSessionDropdownOpen(false);
                            setDateDropdownOpen(!dateDropdownOpen);
                        }}
                    >
                        <Text style={styles.selectText}>{scanDate}</Text>
                        <CompassIcon name={dateDropdownOpen ? 'menu-up' : 'menu-down'} size={18} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
                    </TouchableOpacity>
                </View>
                {dateDropdownOpen && (
                    <ScrollView style={styles.dropdown} nestedScrollEnabled={true}>
                        {availableDates.map((d) => (
                            <TouchableOpacity
                                key={d}
                                style={[styles.dropdownItem, scanDate === d && styles.dropdownItemSelected]}
                                onPress={() => {
                                    setScanDate(d);
                                    setDateDropdownOpen(false);
                                }}
                            >
                                <Text style={styles.dropdownItemText}>{d}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                <View style={styles.filterRow}>
                    <Text style={styles.filterLabel}>
                        {intl.formatMessage({id: 'warehouse_inout.current_scan', defaultMessage: '当前扫描'})}
                    </Text>
                    <TouchableOpacity
                        style={styles.selectBtn}
                        onPress={() => {
                            setDateDropdownOpen(false);
                            setSessionDropdownOpen(!sessionDropdownOpen);
                        }}
                    >
                        <Text style={styles.selectText}>{scanSession}</Text>
                        <CompassIcon name={sessionDropdownOpen ? 'menu-up' : 'menu-down'} size={18} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
                    </TouchableOpacity>
                </View>
                {sessionDropdownOpen && (
                    <ScrollView style={styles.dropdown} nestedScrollEnabled={true}>
                        {availableSessions.map((s) => (
                            <TouchableOpacity
                                key={s}
                                style={[styles.dropdownItem, scanSession === s && styles.dropdownItemSelected]}
                                onPress={() => {
                                    setScanSession(s);
                                    setSessionDropdownOpen(false);
                                }}
                            >
                                <Text style={styles.dropdownItemText}>{s}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>

            {/* Action buttons */}
            <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setShowManualInput(true)}>
                    <Text style={styles.actionBtnText}>
                        {intl.formatMessage({id: 'warehouse_inout.manual_input', defaultMessage: '人工输入'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn, selectedIds.size === 0 && styles.disabledBtn]}
                    onPress={handleDelete}
                    disabled={selectedIds.size === 0}
                >
                    <Text style={styles.actionBtnText}>
                        {intl.formatMessage({id: 'warehouse_inout.delete', defaultMessage: '删除'})}
                        {selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.uploadBtn, (isUploading || isLoadingPickLists || pendingCount === 0) && styles.disabledBtn]}
                    onPress={handleUploadStart}
                    disabled={isUploading || isLoadingPickLists || pendingCount === 0}
                >
                    {isUploading ? (
                        <ActivityIndicator size='small' color='#fff'/>
                    ) : (
                        <Text style={styles.actionBtnText}>
                            {intl.formatMessage({id: 'warehouse_inout.upload', defaultMessage: '上传'})}
                            {pendingCount > 0 ? ` (${pendingCount})` : ''}
                        </Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* 复选框用途提示：明确复选框只用于删除，与上传无关 */}
            <View style={styles.hintRow}>
                <Text style={styles.hintText}>
                    {intl.formatMessage({
                        id: 'warehouse_inout.checkbox_hint',
                        defaultMessage: '勾选条目用于删除未上传记录；上传会提交全部待上传记录',
                    })}
                </Text>
            </View>

            {/* Stats */}
            <View style={styles.statsBar}>
                <Text style={styles.statsLabel}>
                    {intl.formatMessage({id: 'warehouse_inout.subtotal', defaultMessage: '小计'})}
                </Text>
                <Text style={styles.statsValue}>
                    {intl.formatMessage({id: 'warehouse_inout.barcode_count', defaultMessage: '条码数'})}:{stats.totalBarcodes}
                </Text>
                <Text style={styles.statsValue}>
                    {intl.formatMessage({id: 'warehouse_inout.box_count', defaultMessage: '箱数'})}:{stats.totalBoxes}
                </Text>
                <Text style={styles.statsValue}>
                    {intl.formatMessage({id: 'warehouse_inout.total_weight', defaultMessage: '重量'})}:{stats.totalWeight}
                </Text>
            </View>

            {/* Record list */}
            <FlatList
                data={records}
                renderItem={renderRecord}
                keyExtractor={keyExtractor}
                style={styles.list}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({id: 'warehouse_inout.no_records', defaultMessage: '暂无扫描记录'})}
                        </Text>
                    </View>
                }
            />

            {/* Manual input modal */}
            <Modal
                visible={showManualInput}
                transparent={true}
                animationType='fade'
                onRequestClose={() => setShowManualInput(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {intl.formatMessage({id: 'warehouse_inout.manual_input', defaultMessage: '人工输入'})}
                        </Text>
                        <TextInput
                            style={styles.modalInput}
                            value={manualInputText}
                            onChangeText={setManualInputText}
                            placeholder={intl.formatMessage({id: 'warehouse_inout.enter_barcode', defaultMessage: '输入码单号'})}
                            placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                            autoFocus={true}
                            returnKeyType='done'
                            onSubmitEditing={handleManualInput}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnCancel]}
                                onPress={() => {
                                    setShowManualInput(false);
                                    setManualInputText('');
                                }}
                            >
                                <Text style={styles.modalBtnCancelText}>
                                    {intl.formatMessage({id: 'mobile.cancel', defaultMessage: '取消'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnConfirm]}
                                onPress={handleManualInput}
                                disabled={!manualInputText.trim()}
                            >
                                <Text style={styles.modalBtnConfirmText}>
                                    {intl.formatMessage({id: 'warehouse_inout.confirm', defaultMessage: '确认'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Pick list selection modal */}
            <Modal
                visible={showPickListModal}
                transparent={true}
                animationType='slide'
                onRequestClose={() => setShowPickListModal(false)}
            >
                <View style={styles.bottomSheetOverlay}>
                    <View style={styles.bottomSheetContent}>
                        <View style={styles.bottomSheetHeader}>
                            <Text style={styles.bottomSheetTitle}>
                                {intl.formatMessage({id: 'warehouse_inout.select_pick_list_title', defaultMessage: '选择拣货单'})}
                            </Text>
                        </View>

                        {isLoadingPickLists ? (
                            <View style={styles.bottomSheetLoading}>
                                <ActivityIndicator size='large' color={theme.buttonBg}/>
                                <Text style={styles.loadingText}>
                                    {intl.formatMessage({id: 'warehouse_inout.loading', defaultMessage: '加载中...'})}
                                </Text>
                            </View>
                        ) : pendingPickLists.length === 0 ? (
                            <View style={styles.bottomSheetEmpty}>
                                <Text style={styles.emptyText}>
                                    {intl.formatMessage({id: 'warehouse_inout.no_pending_pick_lists', defaultMessage: '暂无待处理的拣货单'})}
                                </Text>
                            </View>
                        ) : (
                            <ScrollView style={styles.bottomSheetList} nestedScrollEnabled={true}>
                                {pendingPickLists.map((pl) => (
                                    <TouchableOpacity
                                        key={pl.name}
                                        style={[styles.pickListItem, selectedPickList === pl.name && styles.pickListItemSelected]}
                                        onPress={() => setSelectedPickList(pl.name)}
                                    >
                                        <View style={[styles.radioButton, selectedPickList === pl.name && styles.radioButtonSelected]}>
                                            {selectedPickList === pl.name && (
                                                <View style={styles.radioButtonInner}/>
                                            )}
                                        </View>
                                        <View style={styles.pickListItemContent}>
                                            <Text style={styles.pickListItemTitle}>{pl.name}</Text>
                                            {pl.customer_name && (
                                                <Text style={styles.pickListItemSubtitle}>
                                                    客户：{pl.customer_name}
                                                </Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}

                        <View style={styles.bottomSheetActions}>
                            <TouchableOpacity
                                style={[styles.bottomSheetBtn, styles.bottomSheetBtnCancel]}
                                onPress={() => {
                                    setShowPickListModal(false);
                                    setSelectedPickList('');
                                }}
                            >
                                <Text style={styles.bottomSheetBtnCancelText}>
                                    {intl.formatMessage({id: 'mobile.cancel', defaultMessage: '取消'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.bottomSheetBtn, styles.bottomSheetBtnConfirm, !selectedPickList && styles.disabledBtn]}
                                onPress={handleUploadConfirm}
                                disabled={!selectedPickList || isLoadingPickLists}
                            >
                                <Text style={styles.bottomSheetBtnConfirmText}>
                                    {intl.formatMessage({id: 'warehouse_inout.upload', defaultMessage: '确认上传'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const getStyleSheet = makeStyleSheetFromTheme((theme: any) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: theme.sidebarBg,
    },
    backBtn: {
        padding: 6,
        marginRight: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    scanBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        backgroundColor: theme.buttonBg,
        gap: 4,
    },
    scanBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 75, 'SemiBold'),
    },

    // Filter area
    filterArea: {
        paddingHorizontal: 12,
        paddingTop: 8,
    },
    filterRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    filterLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        width: 70,
    },
    selectBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    selectText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
    },
    dropdown: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        marginTop: 2,
        marginBottom: 4,
        maxHeight: 160,
        backgroundColor: theme.centerChannelBg,
    },
    dropdownItem: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    dropdownItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    dropdownItemText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
    },

    // Action buttons
    actionRow: {
        flexDirection: 'row',
        paddingHorizontal: 12,
        paddingVertical: 8,
        gap: 8,
    },
    actionBtn: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: theme.buttonBg,
    },
    deleteBtn: {
        backgroundColor: '#F44336',
    },
    uploadBtn: {
        backgroundColor: '#4CAF50',
    },
    disabledBtn: {
        opacity: 0.6,
    },
    actionBtnText: {
        color: '#FFFFFF',
        ...typography('Body', 75, 'SemiBold'),
        fontSize: 13,
    },

    // Checkbox usage hint
    hintRow: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    hintText: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },

    // Stats bar
    statsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
        gap: 12,
    },
    statsLabel: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonBg,
    },
    statsValue: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },

    // List
    list: {
        flex: 1,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    listItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
    },
    checkbox: {
        width: 20,
        height: 20,
        borderRadius: 4,
        borderWidth: 1.5,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    checkboxChecked: {
        // 与删除按钮同色（#F44336），视觉上绑定「复选框 = 删除」
        backgroundColor: '#F44336',
        borderColor: '#F44336',
    },
    checkboxLocked: {
        // 已上传记录：置灰锁定，不可选
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    listIndex: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        width: 28,
        textAlign: 'center',
    },
    listContent: {
        flex: 1,
    },
    listBarcode: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        fontFamily: 'monospace',
    },
    listMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
        gap: 12,
    },
    listMetaText: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },

    // Empty
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        paddingVertical: 16,
    },
    loadingText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 8,
    },

    // Modal (kept for other modals if any)
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: changeOpacity('#000000', 0.5),
    },
    modalContent: {
        width: '80%',
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 20,
    },
    modalTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
        marginBottom: 16,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
        marginBottom: 16,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
    },
    modalBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 8,
    },
    modalBtnCancel: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    modalBtnCancelText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
    },
    modalBtnConfirm: {
        backgroundColor: theme.buttonBg,
    },
    modalBtnConfirmText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },

    // Bottom Sheet (for pick list selection)
    bottomSheetOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: changeOpacity('#000000', 0.5),
    },
    bottomSheetContent: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
        paddingBottom: 34, // Safe area bottom padding
    },
    bottomSheetHeader: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    bottomSheetTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
    bottomSheetLoading: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    bottomSheetEmpty: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    bottomSheetList: {
        maxHeight: 400,
    },
    pickListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    pickListItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    radioButton: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    radioButtonSelected: {
        borderColor: theme.buttonBg,
    },
    radioButtonInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: theme.buttonBg,
    },
    pickListItemContent: {
        flex: 1,
    },
    pickListItemTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    pickListItemSubtitle: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    bottomSheetActions: {
        flexDirection: 'row',
        gap: 12,
        paddingHorizontal: 20,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    bottomSheetBtn: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        borderRadius: 8,
    },
    bottomSheetBtnCancel: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    bottomSheetBtnCancelText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
    },
    bottomSheetBtnConfirm: {
        backgroundColor: theme.buttonBg,
    },
    bottomSheetBtnConfirmText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
}));

export default WarehouseInoutScreen;
