// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * 应用页面
 * 提供入库/出库功能：点击按钮后打开视频扫描二维码，显示扫描结果，点击发送。
 * 暂不调用 API，后续补充。
 */

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {Platform, Pressable, Text, View} from 'react-native';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import NetworkManager from '@managers/network_manager';
import {showQrScannerModal} from '@screens/qr_scanner/show_modal';
import {parseWarehouseBarcode, formatBarcodeFields, makeControlCharsVisible, type BarcodeField} from '@utils/barcode_parser';
import {logInfo} from '@utils/log';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';

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
    resultValue: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
    },
    fieldRow: {
        flexDirection: 'row',
        paddingVertical: 4,
    },
    fieldLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        width: 60,
        ...typography('Body', 100, 'Regular'),
    },
    fieldValue: {
        color: theme.centerChannelColor,
        flex: 1,
        ...typography('Body', 100, 'SemiBold'),
    },
    fieldDivider: {
        height: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginVertical: 6,
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
    scanTypeLabel: {
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 24,
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

const AppsScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const [scanType, setScanType] = useState<ScanType>(null);
    const [scanResult, setScanResult] = useState<string>('');
    const [parsedFields, setParsedFields] = useState<BarcodeField[]>([]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [permissions, setPermissions] = useState<FrappePermissions>({has_stock_in: true, has_stock_out: true});

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

    // 3 秒后自动清除成功提示和扫描结果
    useEffect(() => {
        if (showSuccess) {
            const timer = setTimeout(() => {
                setShowSuccess(false);
                setScanResult('');
                setParsedFields([]);
                setScanType(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [showSuccess]);

    // 打开扫码器的通用方法
    const openScanner = useCallback((type: ScanType) => {
        setScanType(type);
        setScanResult('');
        setParsedFields([]);
        setShowSuccess(false);

        showQrScannerModal(intl, {
            onScanResultCallback: (value: string) => {
                // 调试日志：显示含控制字符的原始数据
                logInfo('[Apps] 扫码原始数据:', makeControlCharsVisible(value));

                setScanResult(value);

                // 解析条码为结构化字段
                const fields = parseWarehouseBarcode(value);
                setParsedFields(fields);

                if (fields.length > 0) {
                    logInfo('[Apps] 解析结果:', formatBarcodeFields(fields));
                }

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

    // 发送按钮：暂不调用 API，仅显示成功提示
    const handleSend = useCallback(() => {
        setShowSuccess(true);
    }, []);

    const scanTypeLabel = scanType === 'stock_in'
        ? intl.formatMessage({id: 'apps.stock_in', defaultMessage: 'Stock In'})
        : scanType === 'stock_out'
            ? intl.formatMessage({id: 'apps.stock_out', defaultMessage: 'Stock Out'})
            : '';

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

            <View style={styles.container}>
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

                            {/* 结构化字段显示 */}
                            {parsedFields.length > 0 ? (
                                parsedFields.map((field, index) => (
                                    <React.Fragment key={field.key}>
                                        <View style={styles.fieldRow}>
                                            <Text style={styles.fieldLabel}>{field.label}</Text>
                                            <Text style={styles.fieldValue}>{field.value}</Text>
                                        </View>
                                        {index < parsedFields.length - 1 && (
                                            <View style={styles.fieldDivider}/>
                                        )}
                                    </React.Fragment>
                                ))
                            ) : (
                                <Text style={styles.resultValue}>{scanResult}</Text>
                            )}
                        </View>

                        {/* 发送按钮 */}
                        <Pressable
                            onPress={handleSend}
                            style={({pressed}) => [
                                styles.actionButton,
                                styles.sendButton,
                                pressed && {opacity: 0.85},
                            ]}
                        >
                            <CompassIcon name='send' size={22} color='#FFFFFF'/>
                            <Text style={styles.buttonText}>
                                {intl.formatMessage({id: 'apps.send', defaultMessage: 'Send'})}
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
            </View>
        </SafeAreaView>
    );
};

export default AppsScreen;
