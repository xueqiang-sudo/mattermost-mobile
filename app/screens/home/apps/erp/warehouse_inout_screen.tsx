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
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
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
    const boxStr = String(item.boxNo || '0').padStart(2, '0');
    const weightStr = String(Math.round((item.netWeight || 0) * 100)).padStart(6, '0');
    if (item.isMasterSheet) {
        return `9${item.codeSheetNo}${boxStr}${weightStr}`;
    }
    return `${item.codeSheetNo}${boxStr}${weightStr}`;
}

const WarehouseInoutScreen = () => {
    const intl = useIntl();
    const navigation = useNavigation();
    const route = useRoute<RouteProp<AppsStackParamList, typeof Screens.APPS_WAREHOUSE_INOUT>>();
    const initialScanType = (route.params?.initialScanType || 'stock_out') as ScanType;
    const initialScanResult = route.params?.scanResult || '';
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    // ── State ──
    const [scanType] = useState<ScanType>(initialScanType);
    const [scanDate, setScanDate] = useState(createCurrentDate());
    const [scanSession, setScanSession] = useState('');
    const [records, setRecords] = useState<ScanRecord[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [currentBarcode, setCurrentBarcode] = useState('');
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
        ? intl.formatMessage({id: 'warehouse_inout.outbound_scan', defaultMessage: '离线出库扫描'})
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
            // Create new scan session (numbered format: 01-HH:MM)
            const session = await createCurrentSession(scanDate, scanType);
            setScanSession(session);

            // Handle initial scan result from route params
            if (initialScanResult) {
                const parsed = parseQrCode(initialScanResult);
                if (parsed) {
                    const displayBarcode = formatDisplayBarcode({
                        codeSheetNo: parsed.codeSheetNo,
                        boxNo: parsed.boxNo,
                        netWeight: parsed.netWeight,
                        isMasterSheet: parsed.isMasterSheet,
                    } as ScanRecord);
                    setCurrentBarcode(displayBarcode);
                    await addScanRecord({
                        scanType,
                        codeSheetNo: parsed.codeSheetNo,
                        boxNo: parsed.boxNo,
                        netWeight: parsed.netWeight,
                        rawScan: initialScanResult,
                        isMasterSheet: parsed.isMasterSheet,
                        scanDate,
                        scanSession: session,
                        status: 'pending',
                    });
                }
            }

            // Load records and dropdowns
            const list = await getScanRecords({scanType, scanDate, scanSession: session});
            setRecords(list);

            const dates = await getDistinctScanDates(scanType);
            if (!dates.includes(scanDate)) {
                dates.unshift(scanDate);
            }
            setAvailableDates(dates);

            const sessions = await getDistinctScanSessions(scanDate, scanType);
            if (!sessions.includes(session)) {
                sessions.unshift(session);
            }
            setAvailableSessions(sessions);
        };
        init();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Stats ──
    const stats = useMemo(() => {
        const totalBarcodes = records.length;
        const totalBoxes = records.reduce((sum, r) => {
            const boxNum = parseInt(r.boxNo, 10);
            return sum + (isNaN(boxNum) ? 1 : boxNum);
        }, 0);
        const totalWeight = records.reduce((sum, r) => sum + (r.netWeight || 0), 0);
        return {totalBarcodes, totalBoxes, totalWeight: totalWeight.toFixed(2)};
    }, [records]);

    const pendingCount = useMemo(() => records.filter((r) => r.status === 'pending' || r.status === 'failed').length, [records]);

    // ── Scan handler ──
    const handleScanResult = useCallback(async (raw: string) => {
        const parsed = parseQrCode(raw);
        if (!parsed) {
            return;
        }

        const displayBarcode = formatDisplayBarcode({
            codeSheetNo: parsed.codeSheetNo,
            boxNo: parsed.boxNo,
            netWeight: parsed.netWeight,
            isMasterSheet: parsed.isMasterSheet,
        } as ScanRecord);
        setCurrentBarcode(displayBarcode);

        await addScanRecord({
            scanType,
            codeSheetNo: parsed.codeSheetNo,
            boxNo: parsed.boxNo,
            netWeight: parsed.netWeight,
            rawScan: raw,
            isMasterSheet: parsed.isMasterSheet,
            scanDate,
            scanSession,
            status: 'pending',
        });

        await loadRecords();
        await loadDropdowns();
    }, [scanType, scanDate, scanSession, loadRecords, loadDropdowns]);

    const openScanner = useCallback(() => {
        showQrScannerModal(intl, {
            onScanResultCallback: (value: string) => {
                handleScanResult(value);
                return true; // handled - close scanner
            },
        });
    }, [intl, handleScanResult]);

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
    }, [manualInputText, scanType, scanDate, scanSession, intl, loadRecords, loadDropdowns]);

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
                '/plugins/com.mattermost.frappe-sync/api/pick-lists/pending',
                {method: 'GET'},
            );

            const lists: {name: string; customer_name?: string}[] = [];
            if (result?.data) {
                if (Array.isArray(result.data)) {
                    lists.push(...result.data);
                } else if (typeof result.data === 'object') {
                    // Handle {message: [...]} wrapper
                    const msg = result.data.message || result.data;
                    if (Array.isArray(msg)) {
                        lists.push(...msg);
                    }
                }
            }
            setPendingPickLists(lists);
        } catch {
            setPendingPickLists([]);
            Alert.alert(
                intl.formatMessage({id: 'warehouse_inout.fetch_pick_lists_failed', defaultMessage: '获取拣货单列表失败'}),
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

        const rawScans = pendingRecords.map((r) => r.rawScan);
        const pendingIds = pendingRecords.map((r) => r.id);

        try {
            const client = NetworkManager.getClient(serverUrl);
            await client.doFetch(
                '/plugins/com.mattermost.frappe-sync/api/pick-list-items',
                {
                    method: 'POST',
                    body: {
                        pick_list: selectedPickList,
                        raw_scans: rawScans,
                    },
                },
            );

            await updateScanRecordStatus(pendingIds, 'uploaded');
        } catch {
            await updateScanRecordStatus(pendingIds, 'failed');
        }

        setIsUploading(false);
        setSelectedPickList('');
        await loadRecords();

        Alert.alert(
            intl.formatMessage({id: 'warehouse_inout.upload_done', defaultMessage: '上传完成'}),
            intl.formatMessage(
                {id: 'warehouse_inout.upload_done_msg', defaultMessage: '已上传 {count} 条记录到拣货单 {pickList}'},
                {count: pendingRecords.length, pickList: selectedPickList},
            ),
        );
    }, [selectedPickList, records, serverUrl, intl, loadRecords]);

    // ── Toggle selection ──
    const toggleSelect = useCallback((id: string) => {
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
        const statusColor = item.status === 'uploaded' ? '#4CAF50'
            : item.status === 'failed' ? '#F44336'
                : changeOpacity(theme.centerChannelColor, 0.4);

        return (
            <TouchableOpacity
                style={[styles.listItem, isSelected && styles.listItemSelected]}
                onPress={() => toggleSelect(item.id)}
            >
                <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
                    {isSelected && <CompassIcon name='check' size={14} color='#fff'/>}
                </View>
                <Text style={styles.listIndex}>{index + 1}</Text>
                <View style={styles.listContent}>
                    <Text style={styles.listBarcode} numberOfLines={1}>
                        {formatDisplayBarcode(item)}
                    </Text>
                </View>
                <View style={[styles.statusDot, {backgroundColor: statusColor}]}/>
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
                    <CompassIcon name='qrcode' size={18} color={theme.buttonColor}/>
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
                <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
                    <Text style={styles.actionBtnText}>
                        {intl.formatMessage({id: 'warehouse_inout.delete', defaultMessage: '删除'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.uploadBtn, (isUploading || isLoadingPickLists) && styles.disabledBtn]}
                    onPress={handleUploadStart}
                    disabled={isUploading || isLoadingPickLists}
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

            {/* Current barcode */}
            {currentBarcode ? (
                <View style={styles.currentBarcode}>
                    <Text style={styles.currentBarcodeLabel}>
                        {intl.formatMessage({id: 'warehouse_inout.current_barcode', defaultMessage: '当前条码'})}
                    </Text>
                    <Text style={styles.currentBarcodeValue} numberOfLines={1}>{currentBarcode}</Text>
                </View>
            ) : null}

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
                animationType='fade'
                onRequestClose={() => setShowPickListModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {intl.formatMessage({id: 'warehouse_inout.select_pick_list_title', defaultMessage: '选择拣货单'})}
                        </Text>

                        {isLoadingPickLists ? (
                            <View style={{alignItems: 'center', paddingVertical: 20}}>
                                <ActivityIndicator size='large' color={theme.buttonBg}/>
                                <Text style={styles.loadingText}>
                                    {intl.formatMessage({id: 'warehouse_inout.loading', defaultMessage: '加载中...'})}
                                </Text>
                            </View>
                        ) : pendingPickLists.length === 0 ? (
                            <Text style={styles.emptyText}>
                                {intl.formatMessage({id: 'warehouse_inout.no_pending_pick_lists', defaultMessage: '暂无待处理的拣货单'})}
                            </Text>
                        ) : (
                            <>
                                <TouchableOpacity
                                    style={styles.selectBtn}
                                    onPress={() => setPickListDropdownOpen(!pickListDropdownOpen)}
                                >
                                    <Text style={styles.selectText}>
                                        {selectedPickList || intl.formatMessage({id: 'warehouse_inout.choose_pick_list', defaultMessage: '请选择拣货单'})}
                                    </Text>
                                    <CompassIcon name={pickListDropdownOpen ? 'menu-up' : 'menu-down'} size={18} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
                                </TouchableOpacity>
                                {pickListDropdownOpen && (
                                    <ScrollView style={styles.dropdown} nestedScrollEnabled={true}>
                                        {pendingPickLists.map((pl) => (
                                            <TouchableOpacity
                                                key={pl.name}
                                                style={[styles.dropdownItem, selectedPickList === pl.name && styles.dropdownItemSelected]}
                                                onPress={() => {
                                                    setSelectedPickList(pl.name);
                                                    setPickListDropdownOpen(false);
                                                }}
                                            >
                                                <Text style={styles.dropdownItemText}>
                                                    {pl.name}{pl.customer_name ? ` - ${pl.customer_name}` : ''}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                )}
                            </>
                        )}

                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnCancel]}
                                onPress={() => {
                                    setShowPickListModal(false);
                                    setSelectedPickList('');
                                    setPickListDropdownOpen(false);
                                }}
                            >
                                <Text style={styles.modalBtnCancelText}>
                                    {intl.formatMessage({id: 'mobile.cancel', defaultMessage: '取消'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnConfirm, !selectedPickList && styles.disabledBtn]}
                                onPress={handleUploadConfirm}
                                disabled={!selectedPickList || isLoadingPickLists}
                            >
                                <Text style={styles.modalBtnConfirmText}>
                                    {intl.formatMessage({id: 'warehouse_inout.upload', defaultMessage: '上传'})}
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

    // Current barcode
    currentBarcode: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    currentBarcodeLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginRight: 8,
    },
    currentBarcodeValue: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        fontFamily: 'monospace',
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
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
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
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
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

    // Modal
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
}));

export default WarehouseInoutScreen;
