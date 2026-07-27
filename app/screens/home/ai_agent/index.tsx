// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 应用页面
 * 提供入库/出库功能：点击按钮后打开视频扫描二维码，显示扫描结果，选择仓库，点击发送创建出入库单。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View} from 'react-native';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';

// 分隔符：U+20AC（€）和 Tab，自动检测
const SCAN_SEPARATOR = String.fromCharCode(0x20AC);
const TAB_SEPARATOR = '\t';

const SCAN_FIELDS = [
    {key: 'code_sheet_no', label: '箱号'},
    {key: 'box_no', label: '第几箱'},
    {key: 'net_weight', label: '净重'},
    {key: 'item_code', label: '产品编码'},
    {key: 'product_batchid', label: '批号'},
    {key: 'fixed_value', label: '固定值'},
    {key: 'product_name', label: '品种'},
    {key: 'product_model', label: '品名'},
    {key: 'product_specification', label: '规格'},
    {key: 'color', label: '色号'},
    {key: 'product_grade', label: '等级'},
];

type ScanField = {key: string; label: string; value: string};

function parseScanResult(raw: string): ScanField[] {
    const tabParts = raw.split(TAB_SEPARATOR).filter(Boolean);
    const euroParts = raw.split(SCAN_SEPARATOR).filter(Boolean);
    const parts = tabParts.length >= euroParts.length ? tabParts : euroParts;

    return parts.map((value, i) => ({
        key: SCAN_FIELDS[i]?.key ?? `field_${i}`,
        label: SCAN_FIELDS[i]?.label ?? `字段${i + 1}`,
        value,
    }));
}

const edges: Edge[] = ['bottom', 'left', 'right'];

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    navBar: {
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.sidebarBg,
    },
    navTitle: {
        color: theme.sidebarHeaderTextColor,
        ...typography('Heading', 200, 'SemiBold'),
    },
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
        paddingHorizontal: 24,
        paddingTop: 40,
    },
    actionButton: {
        height: 60,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: {width: 0, height: 2},
                shadowOpacity: 0.1,
                shadowRadius: 4,
            },
            default: {
                elevation: 3,
            },
        }),
    },
    stockInButton: {
        backgroundColor: '#4A90D9',
    },
    stockOutButton: {
        backgroundColor: '#F5A623',
    },
    disabledButton: {
        backgroundColor: changeOpacity('#999999', 0.5),
    },
    sendButton: {
        backgroundColor: theme.buttonBg,
        marginTop: 16,
    },
    buttonText: {
        color: '#FFFFFF',
        marginLeft: 10,
        ...typography('Body', 200, 'SemiBold'),
    },
    resultContainer: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
        borderRadius: 12,
        padding: 16,
        marginTop: 8,
    },
    resultLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 8,
        ...typography('Body', 75, 'Regular'),
    },
    resultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    resultRowLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
        marginRight: 12,
    },
    resultRowValue: {
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'right',
        ...typography('Body', 200, 'Regular'),
    },
    successContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
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
    scanTypeLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 24,
        ...typography('Body', 75, 'Regular'),
    },
    warehouseButton: {
        height: 48,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginTop: 12,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: theme.centerChannelBg,
    },
    warehouseButtonText: {
        color: theme.centerChannelColor,
        flex: 1,
        ...typography('Body', 200, 'Regular'),
    },
    warehousePlaceholder: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        flex: 1,
        ...typography('Body', 200, 'Regular'),
    },
    pickerOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: changeOpacity('#000000', 0.5),
    },
    pickerContent: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        maxHeight: '60%',
        paddingBottom: 34,
    },
    pickerHeader: {
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    pickerHeaderText: {
        color: theme.centerChannelColor,
        textAlign: 'center',
        ...typography('Heading', 200, 'SemiBold'),
    },
    pickerScroll: {
        maxHeight: 400,
    },
    pickerItem: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    pickerItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    pickerItemText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
    },
    pickerItemSelectedText: {
        color: theme.buttonBg,
        ...typography('Body', 200, 'SemiBold'),
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
}));

type ScanType = 'stock_in' | 'stock_out' | null;

type FrappePermissions = {
    has_stock_in: boolean;
    has_stock_out: boolean;
    frappe_roles?: string[];
    error?: string;
};

type Warehouse = {name: string; warehouse_name?: string};

const AppsScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const [scanType, setScanType] = useState<ScanType>(null);
    const [scanResult, setScanResult] = useState<string>('');
    const [showSuccess, setShowSuccess] = useState(false);
    const [permissions, setPermissions] = useState<FrappePermissions>({has_stock_in: true, has_stock_out: true});
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [selectedWarehouse, setSelectedWarehouse] = useState('');
    const [showWarehousePicker, setShowWarehousePicker] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [sendError, setSendError] = useState('');
    const [entryId, setEntryId] = useState('');

    // Fetch Frappe ERP permissions on mount
    useEffect(() => {
        const fetchPermissions = async () => {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const result = await client.doFetch(
                    `${serverUrl}/plugins/com.mattermost.frappe-sync/api/permissions`,
                    {method: 'GET'},
                );
                if (result && typeof result.has_stock_in === 'boolean') {
                    setPermissions(result as FrappePermissions);
                }
            } catch {
                // If permission check fails, keep buttons enabled (graceful degradation)
            }
        };
        fetchPermissions();
    }, [serverUrl]);

    // Fetch warehouses when scan result appears
    useEffect(() => {
        if (!scanResult) return;
        const fetchWarehouses = async () => {
            try {
                const client = NetworkManager.getClient(serverUrl);
                const result = await client.doFetch(
                    `${serverUrl}/plugins/com.mattermost.frappe-sync/api/warehouses`,
                    {method: 'GET'},
                );
                if (result?.warehouses) {
                    setWarehouses(result.warehouses);
                }
            } catch {
                // Warehouses list stays empty
            }
        };
        fetchWarehouses();
    }, [scanResult, serverUrl]);

    // 5 秒后自动清除成功提示和扫描结果
    useEffect(() => {
        if (showSuccess) {
            const timer = setTimeout(() => {
                setShowSuccess(false);
                setScanResult('');
                setScanType(null);
                setSelectedWarehouse('');
                setEntryId('');
            }, 5000);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [showSuccess]);

    // 打开扫码器的通用方法
    const openScanner = useCallback((type: ScanType) => {
        setScanType(type);
        setScanResult('');
        setShowSuccess(false);
        setSendError('');
        setSelectedWarehouse('');
        setEntryId('');

        showQrScannerModal(intl, {
            onScanResultCallback: (value: string) => {
                setScanResult(value);
                return true; // 返回 true 让扫描器自动关闭
            },
        });
    }, [intl]);

    const handleStockIn = useCallback(() => {
        openScanner('stock_in');
    }, [openScanner]);

    const handleStockOut = useCallback(() => {
        openScanner('stock_out');
    }, [openScanner]);

    const handleSend = useCallback(async () => {
        if (!scanResult || !selectedWarehouse || isSending) {
            return;
        }

        setIsSending(true);
        setSendError('');

        try {
            const fields = parseScanResult(scanResult);
            const getField = (key: string) => fields.find((f) => f.key === key)?.value || '';

            const body = {
                scan_type: scanType,
                warehouse: selectedWarehouse,
                product_name: getField('product_name'),
                product_model: getField('product_model'),
                product_specification: getField('product_specification'),
                color: getField('color'),
                product_grade: getField('product_grade'),
                net_weight: getField('net_weight'),
                product_batchid: getField('product_batchid'),
            };

            const client = NetworkManager.getClient(serverUrl);
            const result = await client.doFetch(
                `${serverUrl}/plugins/com.mattermost.frappe-sync/api/stock-entry`,
                {method: 'POST', body},
            );

            if (result?.status === 'success') {
                setEntryId(result.stock_entry_id || '');
                setShowSuccess(true);
            } else {
                setSendError(result?.error || intl.formatMessage({id: 'apps.stock_entry_error', defaultMessage: 'Stock entry failed'}));
            }
        } catch (e: any) {
            setSendError(e?.message || intl.formatMessage({id: 'apps.network_error', defaultMessage: 'Network error'}));
        } finally {
            setIsSending(false);
        }
    }, [scanResult, scanType, selectedWarehouse, serverUrl, isSending, intl]);

    const scanTypeLabel = scanType === 'stock_in'
        ? intl.formatMessage({id: 'apps.stock_in', defaultMessage: 'Stock In'})
        : scanType === 'stock_out'
            ? intl.formatMessage({id: 'apps.stock_out', defaultMessage: 'Stock Out'})
            : '';

    const canSend = selectedWarehouse !== '' && !isSending;

    return (
        <SafeAreaView
            edges={edges}
            style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
        >
            {/* 导航栏：标题"应用"居中显示，支持三语 */}
            <View style={[styles.navBar, {paddingTop: insets.top}]}>
                <Text style={styles.navTitle}>
                    {intl.formatMessage({id: 'tab_bar.apps.label', defaultMessage: 'Apps'})}
                </Text>
            </View>

            <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
                {/* 入库按钮 */}
                <Pressable
                    onPress={permissions.has_stock_in ? handleStockIn : undefined}
                    style={({pressed}) => [
                        styles.actionButton,
                        permissions.has_stock_in ? styles.stockInButton : styles.disabledButton,
                        pressed && permissions.has_stock_in && {opacity: 0.85},
                    ]}
                >
                    <CompassIcon name='download-outline' size={24} color='#FFFFFF'/>
                    <Text style={styles.buttonText}>
                        {intl.formatMessage({id: 'apps.stock_in', defaultMessage: 'Stock In'})}
                    </Text>
                </Pressable>

                {/* 出库按钮 */}
                <Pressable
                    onPress={permissions.has_stock_out ? handleStockOut : undefined}
                    style={({pressed}) => [
                        styles.actionButton,
                        permissions.has_stock_out ? styles.stockOutButton : styles.disabledButton,
                        pressed && permissions.has_stock_out && {opacity: 0.85},
                    ]}
                >
                    <CompassIcon name='export-variant' size={24} color='#FFFFFF'/>
                    <Text style={styles.buttonText}>
                        {intl.formatMessage({id: 'apps.stock_out', defaultMessage: 'Stock Out'})}
                    </Text>
                </Pressable>

                {/* 扫描结果区域（扫描后显示） */}
                {scanResult ? (
                    <>
                        <Text style={styles.scanTypeLabel}>{scanTypeLabel}</Text>
                        <View style={styles.resultContainer}>
                            <Text style={styles.resultLabel}>
                                {intl.formatMessage({id: 'apps.scan_result', defaultMessage: 'Scan Result'})}
                            </Text>
                            {parseScanResult(scanResult).map((field, idx) => (
                                <View key={`${field.key}-${idx}`} style={styles.resultRow}>
                                    <Text style={styles.resultRowLabel}>{field.label}</Text>
                                    <Text style={styles.resultRowValue}>{field.value}</Text>
                                </View>
                            ))}
                        </View>

                        {/* 仓库选择 */}
                        <Pressable
                            onPress={() => setShowWarehousePicker(true)}
                            style={styles.warehouseButton}
                        >
                            <CompassIcon name='warehouse-outline' size={20} color={changeOpacity(theme.centerChannelColor, 0.56)}/>
                            {selectedWarehouse ? (
                                <Text style={styles.warehouseButtonText}>{selectedWarehouse}</Text>
                            ) : (
                                <Text style={styles.warehousePlaceholder}>
                                    {intl.formatMessage({id: 'apps.choose_warehouse', defaultMessage: 'Choose warehouse...'})}
                                </Text>
                            )}
                            <CompassIcon name='chevron-down' size={20} color={changeOpacity(theme.centerChannelColor, 0.56)}/>
                        </Pressable>

                        {/* 错误提示 */}
                        {sendError ? (
                            <View style={styles.errorContainer}>
                                <CompassIcon name='alert-outline' size={18} color='#F44336'/>
                                <Text style={styles.errorText}>{sendError}</Text>
                            </View>
                        ) : null}

                        {/* 发送按钮 */}
                        <Pressable
                            onPress={handleSend}
                            disabled={!canSend}
                            style={({pressed}) => [
                                styles.actionButton,
                                styles.sendButton,
                                !canSend && styles.disabledButton,
                                pressed && canSend && {opacity: 0.85},
                            ]}
                        >
                            {isSending ? (
                                <ActivityIndicator color='#FFFFFF' size='small'/>
                            ) : (
                                <CompassIcon name='send' size={22} color='#FFFFFF'/>
                            )}
                            <Text style={styles.buttonText}>
                                {isSending
                                    ? intl.formatMessage({id: 'apps.sending', defaultMessage: 'Sending...'})
                                    : intl.formatMessage({id: 'apps.send', defaultMessage: 'Send'})
                                }
                            </Text>
                        </Pressable>
                    </>
                ) : null}

                {/* 发送成功提示 */}
                {showSuccess && (
                    <View style={styles.successContainer}>
                        <CompassIcon name='check-circle' size={22} color='#4CAF50'/>
                        <Text style={styles.successText}>
                            {intl.formatMessage({id: 'apps.send_success', defaultMessage: 'Send Successful'})}
                        </Text>
                    </View>
                )}
                {showSuccess && entryId ? (
                    <Text style={styles.successDetail}>{entryId}</Text>
                ) : null}
            </ScrollView>

            {/* 仓库选择 Modal */}
            <Modal
                visible={showWarehousePicker}
                transparent={true}
                animationType='slide'
                onRequestClose={() => setShowWarehousePicker(false)}
            >
                <Pressable
                    style={styles.pickerOverlay}
                    onPress={() => setShowWarehousePicker(false)}
                >
                    <Pressable style={styles.pickerContent} onPress={(e) => e.stopPropagation()}>
                        <View style={styles.pickerHeader}>
                            <Text style={styles.pickerHeaderText}>
                                {intl.formatMessage({id: 'apps.select_warehouse', defaultMessage: 'Select Warehouse'})}
                            </Text>
                        </View>
                        <ScrollView style={styles.pickerScroll}>
                            {warehouses.map((wh) => (
                                <Pressable
                                    key={wh.name}
                                    style={[
                                        styles.pickerItem,
                                        selectedWarehouse === wh.name && styles.pickerItemSelected,
                                    ]}
                                    onPress={() => {
                                        setSelectedWarehouse(wh.name);
                                        setShowWarehousePicker(false);
                                        setSendError('');
                                    }}
                                >
                                    <Text style={selectedWarehouse === wh.name ? styles.pickerItemSelectedText : styles.pickerItemText}>
                                        {wh.warehouse_name || wh.name}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </SafeAreaView>
    );
};

export default AppsScreen;
