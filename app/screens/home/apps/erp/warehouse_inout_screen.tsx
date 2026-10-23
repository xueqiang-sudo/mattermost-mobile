// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 出入库 Screen — 扫码创建 Pick List
 * 流程：点击出库/入库按钮 → 扫描二维码 → 选择仓库 → 发送创建拣货单
 * 调用 frappe-sync 插件 API (/api/pick-list) → MCP erpnext_pick_list_create
 */

import {useNavigation, useRoute, type RouteProp} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
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

type DisplayField = {key: string; label: string; value: string};
type ScanType = 'stock_in' | 'stock_out' | null;
type Warehouse = {name: string; warehouse_name?: string};

const WarehouseInoutScreen = () => {
    const intl = useIntl();
    const navigation = useNavigation();
    const route = useRoute<RouteProp<AppsStackParamList, typeof Screens.APPS_WAREHOUSE_INOUT>>();
    const initialScanType = route.params?.initialScanType || null;
    const initialScanResult = route.params?.scanResult || '';
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [scanType, setScanType] = useState<ScanType>(initialScanType);
    const [scanResult, setScanResult] = useState(initialScanResult);
    const [showSuccess, setShowSuccess] = useState(false);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [warehouseDropdownOpen, setWarehouseDropdownOpen] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [pickListId, setPickListId] = useState('');
    const [resultFields, setResultFields] = useState<DisplayField[]>([]);
    const [scannerError, setScannerError] = useState('');

    const openScanner = useCallback((type: ScanType) => {
        setScanType(type);
        setScanResult('');
        setShowSuccess(false);
        setSendError('');
        setSelectedWarehouse('');
        setPickListId('');
        setResultFields([]);
        setScannerError('');

        try {
            showQrScannerModal(intl, {
                onScanResultCallback: (value: string) => {
                    setScanResult(value);
                    return true;
                },
            });
        } catch (e: any) {
            setScannerError(e?.message || 'Failed to open scanner');
        }
    }, [intl]);

    useEffect(() => {
        navigation.setOptions({
            title: intl.formatMessage({id: 'workbench.tab.warehouse_inout', defaultMessage: '出入库'}),
        });
    }, [navigation, intl]);

    // Fetch warehouses on mount
    useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const data = await client.doFetch(
                    '/plugins/com.mattermost.frappe-sync/api/warehouses',
                    {method: 'GET'},
                );
                if (data?.warehouses) {
                    setWarehouses(data.warehouses);
                }
            } catch (e: any) {
                console.warn('Failed to fetch warehouses:', e?.message || e);
            }
        };
        fetchWarehouses();
    }, [serverUrl]);

    // Auto-clear success after 5 seconds
    useEffect(() => {
        if (showSuccess) {
            const timer = setTimeout(() => {
                setShowSuccess(false);
                setScanResult('');
                setScanType(null);
                setSelectedWarehouse('');
                setPickListId('');
                setResultFields([]);
            }, 5000);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [showSuccess]);

    const handleSend = useCallback(async () => {
        if (!scanResult || !selectedWarehouse || isSending) {
            return;
        }

        setIsSending(true);
        setSendError('');

        try {
            const body = {
                scan_type: scanType,
                warehouse: selectedWarehouse,
                raw_scan: scanResult,
            };

            const client = NetworkManager.getClient(serverUrl);
            const result = await client.doFetch(
                '/plugins/com.mattermost.frappe-sync/api/pick-list',
                {method: 'POST', body},
            );

            if (result?.fields) {
                setResultFields(result.fields);
            }

            if (result?.status === 'success') {
                setPickListId(result.pick_list_id || '');
                setShowSuccess(true);
            } else {
                setSendError(result?.error || intl.formatMessage({id: 'warehouse_inout.error', defaultMessage: '创建失败'}));
            }
        } catch (e: any) {
            setSendError(e?.message || intl.formatMessage({id: 'apps.network_error', defaultMessage: 'Network error'}));
        } finally {
            setIsSending(false);
        }
    }, [scanResult, scanType, selectedWarehouse, serverUrl, isSending, intl]);

    const scanTypeLabel = scanType === 'stock_in'
        ? intl.formatMessage({id: 'warehouse_inout.inbound', defaultMessage: '入库'})
        : scanType === 'stock_out'
            ? intl.formatMessage({id: 'warehouse_inout.outbound', defaultMessage: '出库'})
            : '';

    const canSend = selectedWarehouse !== '' && !isSending && scanResult !== '';

    return (
        <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
            {/* Header with back button */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
                    <CompassIcon name='arrow-left' size={20} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {scanTypeLabel || intl.formatMessage({id: 'workbench.tab.warehouse_inout', defaultMessage: '出入库'})}
                </Text>
            </View>

            {/* Two action buttons — hide when opened directly from apps panel */}
            {!initialScanType && (
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.inButton]}
                        onPress={() => openScanner('stock_in')}
                    >
                        <CompassIcon name='import' size={28} color='#fff'/>
                        <Text style={styles.actionButtonText}>
                            {intl.formatMessage({id: 'warehouse_inout.inbound', defaultMessage: '入库'})}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.outButton]}
                        onPress={() => openScanner('stock_out')}
                    >
                        <CompassIcon name='export-variant' size={28} color='#fff'/>
                        <Text style={styles.actionButtonText}>
                            {intl.formatMessage({id: 'warehouse_inout.outbound', defaultMessage: '出库'})}
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Scan result area */}
            {scanResult ? (
                <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.scanTypeLabel}>{scanTypeLabel}</Text>

                    {/* Raw scan data */}
                    <View style={styles.rawScanContainer}>
                        <Text style={styles.rawScanLabel}>
                            {intl.formatMessage({id: 'apps.scan_result', defaultMessage: '扫码结果'})}
                        </Text>
                        <Text style={styles.rawScanText} numberOfLines={3}>
                            {scanResult}
                        </Text>
                    </View>

                    {/* Parsed fields from server */}
                    {resultFields.length > 0 && (
                        <View style={styles.resultContainer}>
                            {resultFields.filter((f) => f.value).map((field, idx) => (
                                <View key={`${field.key}-${idx}`} style={styles.resultRow}>
                                    <Text style={styles.resultRowLabel}>{field.label}</Text>
                                    <Text style={styles.resultRowValue}>{field.value}</Text>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Warehouse selector */}
                    <Text style={styles.label}>
                        {intl.formatMessage({id: 'apps.select_warehouse', defaultMessage: '选择仓库'})}
                    </Text>
                    <TouchableOpacity
                        onPress={() => setWarehouseDropdownOpen(!warehouseDropdownOpen)}
                        style={styles.selectBtn}
                    >
                        <Text style={selectedWarehouse ? styles.selectText : styles.selectPlaceholder}>
                            {selectedWarehouse || intl.formatMessage({id: 'apps.choose_warehouse', defaultMessage: '选择仓库...'})}
                        </Text>
                        <CompassIcon name={warehouseDropdownOpen ? 'menu-up' : 'menu-down'} size={20} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
                    </TouchableOpacity>
                    {warehouseDropdownOpen && (
                        <ScrollView style={styles.dropdown}>
                            {warehouses.map((wh) => (
                                <TouchableOpacity
                                    key={wh.name}
                                    style={[styles.dropdownItem, selectedWarehouse === wh.name && styles.dropdownItemSelected]}
                                    onPress={() => {
                                        setSelectedWarehouse(wh.name);
                                        setWarehouseDropdownOpen(false);
                                        setSendError('');
                                    }}
                                >
                                    <Text style={styles.dropdownItemText}>
                                        {wh.warehouse_name || wh.name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                            {warehouses.length === 0 && (
                                <View style={styles.emptyDropdownContainer}>
                                    <Text style={styles.emptyText}>
                                        {intl.formatMessage({id: 'apps.no_warehouses', defaultMessage: '暂无仓库'})}
                                    </Text>
                                </View>
                            )}
                        </ScrollView>
                    )}

                    {/* Error */}
                    {sendError ? (
                        <View style={styles.errorContainer}>
                            <CompassIcon name='alert-outline' size={18} color='#F44336'/>
                            <Text style={styles.errorText}>{sendError}</Text>
                        </View>
                    ) : null}

                    {/* Send button */}
                    <TouchableOpacity
                        onPress={handleSend}
                        disabled={!canSend}
                        style={[
                            styles.sendButton,
                            !canSend && styles.disabledButton,
                        ]}
                    >
                        {isSending ? (
                            <ActivityIndicator color='#FFFFFF' size='small'/>
                        ) : (
                            <CompassIcon name='send' size={22} color='#FFFFFF'/>
                        )}
                        <Text style={styles.sendButtonText}>
                            {isSending
                                ? intl.formatMessage({id: 'apps.sending', defaultMessage: '发送中...'})
                                : intl.formatMessage({id: 'apps.send', defaultMessage: '发送'})}
                        </Text>
                    </TouchableOpacity>

                    {/* Success */}
                    {showSuccess && (
                        <View style={styles.successContainer}>
                            <CompassIcon name='check-circle' size={22} color='#4CAF50'/>
                            <Text style={styles.successText}>
                                {intl.formatMessage({id: 'apps.send_success', defaultMessage: '发送成功'})}
                            </Text>
                        </View>
                    )}
                    {showSuccess && pickListId ? (
                        <Text style={styles.successDetail}>{pickListId}</Text>
                    ) : null}
                </ScrollView>
            ) : null}

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
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    backBtn: {
        padding: 8,
        marginRight: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    buttonRow: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
    },
    actionButton: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        borderRadius: 12,
        gap: 8,
    },
    outButton: {
        backgroundColor: '#e74c3c',
    },
    inButton: {
        backgroundColor: '#27ae60',
    },
    actionButtonText: {
        color: '#fff',
        ...typography('Body', 200, 'SemiBold'),
    },
    contentScroll: {
        flex: 1,
        paddingHorizontal: 16,
    },
    scanTypeLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        marginBottom: 12,
        ...typography('Body', 75, 'Regular'),
    },
    rawScanContainer: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 12,
        padding: 16,
    },
    rawScanLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 8,
        ...typography('Body', 75, 'Regular'),
    },
    rawScanText: {
        color: theme.centerChannelColor,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        ...typography('Body', 75, 'Regular'),
    },
    resultContainer: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
    },
    resultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    resultRowLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginRight: 12,
        ...typography('Body', 75, 'Regular'),
    },
    resultRowValue: {
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'right',
        ...typography('Body', 200, 'Regular'),
    },
    label: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 12,
        marginBottom: 4,
        ...typography('Body', 75, 'Regular'),
    },
    selectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    selectText: {
        color: theme.centerChannelColor,
        flex: 1,
        ...typography('Body', 200, 'Regular'),
    },
    selectPlaceholder: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        flex: 1,
        ...typography('Body', 200, 'Regular'),
    },
    dropdown: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        marginTop: 4,
        maxHeight: 200,
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
    emptyDropdownContainer: {
        paddingHorizontal: 12,
        paddingVertical: 16,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        ...typography('Body', 75, 'Regular'),
    },
    errorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        padding: 10,
        borderRadius: 8,
        backgroundColor: changeOpacity('#F44336', 0.1),
    },
    errorText: {
        color: '#F44336',
        marginLeft: 8,
        flex: 1,
        ...typography('Body', 75, 'Regular'),
    },
    sendButton: {
        height: 52,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        backgroundColor: theme.buttonBg,
        gap: 8,
    },
    disabledButton: {
        opacity: 0.5,
    },
    sendButtonText: {
        color: '#FFFFFF',
        ...typography('Body', 200, 'SemiBold'),
    },
    successContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        padding: 12,
        borderRadius: 8,
        backgroundColor: changeOpacity('#4CAF50', 0.1),
    },
    successText: {
        color: '#4CAF50',
        marginLeft: 8,
        ...typography('Body', 200, 'SemiBold'),
    },
    successDetail: {
        color: changeOpacity('#4CAF50', 0.8),
        marginTop: 4,
        textAlign: 'center',
        ...typography('Body', 75, 'Regular'),
    },
}));

export default WarehouseInoutScreen;
