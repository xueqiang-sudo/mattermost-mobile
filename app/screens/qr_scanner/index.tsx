// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.
/* eslint-disable max-lines */

import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
// eslint-disable-next-line import/order
import {useIntl} from 'react-intl';

// @ts-ignore
import {Alert, AppState, BackHandler, Linking, NativeModules, Platform, StyleSheet, Text, TouchableOpacity, View, type AppStateStatus} from 'react-native';
import {launchImageLibrary} from 'react-native-image-picker';
import {Navigation} from 'react-native-navigation';
import {Camera, useCameraDevices, useCameraPermission, useCodeScanner, type Code} from 'react-native-vision-camera';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {dismissModal, showModalWithBackButton} from '@screens/navigation';
import {logInfo} from '@utils/log';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {tryOpenURL} from '@utils/url';

import type {AvailableScreens} from '@typings/screens/navigation';

const AMBIENT_LOW_LIGHT_SHOW_THRESHOLD = 90;
const AMBIENT_LOW_LIGHT_HIDE_THRESHOLD = 120;
const AMBIENT_LOW_LIGHT_CONSECUTIVE_SAMPLES_TO_SHOW = 1;
const AMBIENT_BRIGHT_CONSECUTIVE_SAMPLES_TO_HIDE = 3;
const AMBIENT_LIGHT_POLL_INTERVAL_MS = 1500;

type QRCodeScannerNativeModule = {
    scanImageAtPath?: (imagePath: string) => Promise<Array<{value?: string; type?: string}>>;
    getAmbientLightLevel?: () => Promise<number | null>;
};

const {QRCodeScanner} = NativeModules as {QRCodeScanner?: QRCodeScannerNativeModule};

type Props = {
    componentId: AvailableScreens;
    onScanResult?: (data: string) => boolean; // 返回 true 表示外部处理了，false 表示使用默认处理
}

const getStyleSheet = makeStyleSheetFromTheme(() => {
    return {
        container: {
            flex: 1,
            backgroundColor: '#000000',
        },
        cameraContainer: {
            flex: 1,
        },
        overlay: {
            ...StyleSheet.absoluteFillObject,
        },
        maskTop: {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '25%',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
        },
        maskBottom: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '35%',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
        },
        maskLeft: {
            position: 'absolute',
            top: '25%',
            left: 0,
            width: '12.5%',
            height: '40%',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
        },
        maskRight: {
            position: 'absolute',
            top: '25%',
            right: 0,
            width: '12.5%',
            height: '40%',
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
        },
        scanFrame: {
            position: 'absolute',
            top: '25%',
            left: '12.5%',
            width: '75%',
            height: '40%',
            borderWidth: 2,
            borderColor: '#09BB07',
            borderRadius: 8,
        },
        closeButton: {
            position: 'absolute',
            top: Platform.select({ios: 60, android: 40}),
            left: 20,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 20,
        },
        torchButton: {
            position: 'absolute',
            top: '72%',
            left: '50%',
            marginLeft: -20,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 20,
        },
        bottomActions: {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingBottom: Platform.select({ios: 40, android: 30}),
            paddingTop: 20,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            flexDirection: 'row',
            justifyContent: 'space-around',
            alignItems: 'center',
            zIndex: 20,
        },
        actionButton: {
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 80,
        },
        actionIcon: {
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 8,
        },
        actionText: {
            fontSize: 14,
            color: '#FFFFFF',
            textAlign: 'center',
        },
        permissionContainer: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            backgroundColor: '#000000',
        },
        permissionText: {
            fontSize: 16,
            color: '#FFFFFF',
            textAlign: 'center',
            marginBottom: 20,
        },
        permissionButton: {
            backgroundColor: '#09BB07',
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 4,
        },
        permissionButtonText: {
            fontSize: 16,
            fontWeight: '600',
            color: '#FFFFFF',
        },
    };
});

const QRScanner = ({componentId, onScanResult}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const {hasPermission, requestPermission} = useCameraPermission();

    // 获取所有设备并选择有手电筒的后置摄像头
    const devices = useCameraDevices();
    const device = useMemo(() => {
        // 优先选择有手电筒的后置摄像头
        const backDevicesWithTorch = devices.filter((d) => d.position === 'back' && d.hasTorch);
        if (backDevicesWithTorch.length > 0) {
            logInfo('找到支持手电筒的后置摄像头:', backDevicesWithTorch[0].name);
            return backDevicesWithTorch[0];
        }

        // 如果没有，选择任意后置摄像头
        const backDevices = devices.filter((d) => d.position === 'back');
        if (backDevices.length > 0) {
            logInfo('使用后置摄像头（无手电筒）:', backDevices[0].name);
            return backDevices[0];
        }

        // 最后的备选方案
        logInfo('使用默认设备');
        return devices[0];
    }, [devices]);

    const [isScreenVisible, setIsScreenVisible] = useState(true);
    const [isAppActive, setIsAppActive] = useState(() => AppState.currentState === 'active');
    const [isImagePickerOpen, setIsImagePickerOpen] = useState(false);
    const [lastScannedCode, setLastScannedCode] = useState<string>('');
    const [scanningEnabled, setScanningEnabled] = useState(true); // 控制是否处理扫描结果
    const [torchOn, setTorchOn] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [cameraRestricted, setCameraRestricted] = useState(false);
    const [showTorchByAmbientLight, setShowTorchByAmbientLight] = useState(false);
    const isMountedRef = useRef(true);
    const ambientTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const ambientPollingTokenRef = useRef(0);
    const showTorchByAmbientLightRef = useRef(false);
    const consecutiveAmbientLowLightRef = useRef(0);
    const consecutiveAmbientBrightRef = useRef(0);
    const ambientLightLuxRef = useRef<number | null>(null);
    const appStateRef = useRef(AppState.currentState);
    const isActive = isScreenVisible && isAppActive && !isImagePickerOpen;

    useEffect(() => {
        if (!hasPermission) {
            requestPermission();
        }
    }, [hasPermission, requestPermission]);

    useEffect(() => {
        return () => {
            isMountedRef.current = false;
            ambientPollingTokenRef.current += 1;
            if (ambientTimerRef.current) {
                clearInterval(ambientTimerRef.current);
                ambientTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        const appStateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
            const wasActive = appStateRef.current === 'active';
            const nowActive = nextAppState === 'active';
            appStateRef.current = nextAppState;

            if (wasActive && !nowActive) {
                logInfo('[QRScanner] 应用进入后台，暂停相机并关闭手电筒');
                setIsAppActive(false);
                setTorchOn(false);
            } else if (!wasActive && nowActive) {
                logInfo('[QRScanner] 应用回到前台，恢复相机');
                setIsAppActive(true);
            }
        });

        return () => {
            appStateSubscription.remove();
        };
    }, []);

    // 检查设备是否支持手电筒
    const supportsTorch = useMemo(() => device?.hasTorch ?? false, [device]);

    const stopCameraAndDismiss = useCallback(() => {
        logInfo('[QRScanner.handleClose] 停止相机');
        setIsScreenVisible(false);

        // 再延迟一点确保相机完全停止后关闭 modal
        const dismissTimer = setTimeout(() => {
            logInfo('[QRScanner.handleClose] 执行 dismissModal');
            dismissModal({componentId});
        }, 50);

        return dismissTimer;
    }, [componentId]);

    const handleClose = useCallback(() => {
        logInfo('[QRScanner.handleClose] 开始关闭扫码页，手电筒状态:', torchOn);

        // 先关闭手电筒
        setTorchOn(false);

        // 延迟一下让手电筒先关闭，再停止相机和关闭 modal
        const delay = supportsTorch ? 200 : 50;
        logInfo('[QRScanner.handleClose] 延迟', delay, 'ms 后停止相机并关闭 modal');

        setTimeout(stopCameraAndDismiss, delay);
    }, [stopCameraAndDismiss, supportsTorch, torchOn]);

    // Handle Android back button
    useEffect(() => {
        if (Platform.OS !== 'android') {
            return undefined;
        }

        logInfo('[QRScanner] 注册 Android 返回键监听器');
        const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
            logInfo('[QRScanner] Android 返回键被按下，关闭扫码页');
            handleClose();
            return true; // 阻止默认行为
        });

        return () => {
            logInfo('[QRScanner] 移除 Android 返回键监听器');
            backHandler.remove();
        };
    }, [handleClose]);

    // Turn off torch when user swipes to dismiss (before modal is gone so Camera still receives torch='off')
    useEffect(() => {
        logInfo('[QRScanner] 注册导航生命周期监听器');
        const listener = Navigation.events().registerComponentListener(
            {
                modalAttemptedToDismiss: () => {
                    logInfo('[QRScanner] modalAttemptedToDismiss - 用户开始滑动关闭，关闭手电筒');
                    setTorchOn(false);
                },
                componentDidAppear: () => {
                    logInfo('[QRScanner] componentDidAppear - 页面显示，恢复页面可见状态');
                    setIsScreenVisible(true);
                },
                componentDidDisappear: () => {
                    logInfo('[QRScanner] componentDidDisappear - 页面已消失，关闭手电筒');
                    setTorchOn(false);
                },
            },
            componentId,
        );
        return () => {
            logInfo('[QRScanner] 移除导航生命周期监听器');
            listener.remove();
        };
    }, [componentId]);

    const handleCameraError = useCallback((error: {code?: string; message?: string}) => {
        logInfo('相机错误:', error);

        // 如果是权限被限制的错误
        if (error?.code === 'system/camera-is-restricted') {
            setCameraRestricted(true);
            setTorchOn(false);
            setIsScreenVisible(false);

            // 只显示一次提示
            if (!cameraRestricted) {
                Alert.alert(
                    intl.formatMessage({
                        id: 'mobile.qr_scanner.camera_restricted_title',
                        defaultMessage: 'Camera restricted',
                    }),
                    intl.formatMessage({
                        id: 'mobile.qr_scanner.camera_restricted_message',
                        defaultMessage: 'Camera is restricted by the system. You can use "Select from gallery" to scan a QR code from an image.',
                    }),
                );
            }
        }
    }, [intl, cameraRestricted]);

    const processScanResult = useCallback((value: string) => {
        logInfo('[QRScanner.processScanResult] 处理扫描结果:', value);

        // 先尝试外部处理
        if (onScanResult) {
            const handled = onScanResult(value);
            if (handled) {
                logInfo('[QRScanner.processScanResult] 外部已处理，关闭扫描页');
                handleClose();
                return;
            }
        }

        // 检查是否是 URL
        const isUrl = value.startsWith('http://') || value.startsWith('https://');

        if (isUrl) {
            // URL 类型：使用 tryOpenURL 打开（会在 modal 中打开网页）
            logInfo('[QRScanner.processScanResult] 检测到 URL，使用 tryOpenURL 打开:', value);
            tryOpenURL(value, (err: Error) => {
                logInfo('[QRScanner.processScanResult] 打开 URL 失败:', err);
                Alert.alert(
                    intl.formatMessage({
                        id: 'mobile.qr_scanner.open_url_failed_title',
                        defaultMessage: 'Failed to open URL',
                    }),
                    intl.formatMessage({
                        id: 'mobile.qr_scanner.open_url_failed_message',
                        defaultMessage: 'Could not open the URL. Please try again.',
                    }),
                );
            }, () => {
                logInfo('[QRScanner.processScanResult] 打开 URL 成功:', value);
            });
        } else {
            // 非 URL 类型：显示内容并提供复制功能
            logInfo('[QRScanner.processScanResult] 非 URL 数据，显示内容');
            Alert.alert(
                intl.formatMessage({
                    id: 'mobile.qr_scanner.scan_result_title',
                    defaultMessage: 'Scan Result',
                }),
                value,
                [
                    {
                        text: intl.formatMessage({
                            id: 'mobile.qr_scanner.copy',
                            defaultMessage: 'Copy',
                        }),
                        onPress: () => {
                            logInfo('[QRScanner.processScanResult] 复制内容:', value);
                            Clipboard.setString(value);
                        },
                    },
                    {
                        text: intl.formatMessage({
                            id: 'mobile.qr_scanner.close',
                            defaultMessage: 'Close',
                        }),
                        style: 'cancel',
                    },
                ],
            );
        }

        logInfo('[QRScanner.processScanResult] 执行关闭扫描界面');
        handleClose();
    }, [onScanResult, handleClose, intl]);

    const handleCodeScanned = useCallback((codes: Code[]) => {
        if (codes.length > 0 && scanningEnabled) {
            const code = codes[0];
            const value = code.value || '';

            // 防抖处理：避免重复扫描同一个码
            if (value && value !== lastScannedCode) {
                logInfo('[QRScanner.handleCodeScanned] 检测到新码，上次:', lastScannedCode);
                setLastScannedCode(value);
                setScanningEnabled(false); // 暂停扫描处理，但相机保持运行

                // 打印扫描结果到控制台
                logInfo('[QRScanner.handleCodeScanned] ' + '='.repeat(50));
                logInfo('[QRScanner.handleCodeScanned] 扫描成功！');
                logInfo('[QRScanner.handleCodeScanned] 码类型:', code.type);
                logInfo('[QRScanner.handleCodeScanned] 码内容:', value);
                logInfo('[QRScanner.handleCodeScanned] 坐标信息:', JSON.stringify(code.frame));
                logInfo('[QRScanner.handleCodeScanned] ' + '='.repeat(50));

                // 处理扫描结果
                processScanResult(value);
            }
        }
    }, [scanningEnabled, lastScannedCode, processScanResult]);

    const codeScanner = useCodeScanner({
        codeTypes: ['qr', 'ean-13', 'ean-8', 'code-128', 'code-39', 'code-93', 'aztec', 'data-matrix', 'pdf-417', 'upc-e'],
        onCodeScanned: handleCodeScanned,
    });

    const handleOpenSettings = useCallback(() => {
        Linking.openSettings();
    }, []);

    const toggleTorch = useCallback(() => {
        const newValue = !torchOn;
        logInfo('[QRScanner.toggleTorch] 点击手电筒按钮');
        logInfo('[QRScanner.toggleTorch] 设备支持手电筒:', supportsTorch);
        logInfo('[QRScanner.toggleTorch] 相机就绪:', cameraReady);
        logInfo('[QRScanner.toggleTorch] 当前状态:', torchOn, '-> 新状态:', newValue);
        setTorchOn(newValue);
    }, [torchOn, supportsTorch, cameraReady]);

    useEffect(() => {
        logInfo('[QRScanner] === 设备信息 ===');
        logInfo('[QRScanner] hasDevice:', Boolean(device));
        logInfo('[QRScanner] hasTorch:', supportsTorch);
        logInfo('[QRScanner] deviceName:', device?.name);
        logInfo('[QRScanner] devicePosition:', device?.position);
        logInfo('[QRScanner] isActive:', isActive);
        logInfo('[QRScanner] ================');
    }, [device, supportsTorch, isActive]);

    useEffect(() => {
        logInfo('[QRScanner] 手电筒状态变化:', torchOn ? '开启' : '关闭');
    }, [torchOn]);

    useEffect(() => {
        showTorchByAmbientLightRef.current = showTorchByAmbientLight;
    }, [showTorchByAmbientLight]);

    useEffect(() => {
        ambientPollingTokenRef.current += 1;
        const token = ambientPollingTokenRef.current;
        if (ambientTimerRef.current) {
            clearInterval(ambientTimerRef.current);
            ambientTimerRef.current = null;
        }

        if (Platform.OS !== 'android' || !supportsTorch || !isActive || !QRCodeScanner?.getAmbientLightLevel) {
            ambientLightLuxRef.current = null;
            return;
        }

        const updateAmbientLight = () => {
            QRCodeScanner.getAmbientLightLevel?.().then((lux) => {
                if (token !== ambientPollingTokenRef.current) {
                    return;
                }
                if (typeof lux === 'number' && Number.isFinite(lux)) {
                    ambientLightLuxRef.current = lux;
                    logInfo('[QRScanner] 环境光(lux):', lux);

                    let nextVisibility = showTorchByAmbientLightRef.current;
                    if (lux <= AMBIENT_LOW_LIGHT_SHOW_THRESHOLD) {
                        consecutiveAmbientLowLightRef.current += 1;
                        consecutiveAmbientBrightRef.current = 0;
                        if (!nextVisibility && consecutiveAmbientLowLightRef.current >= AMBIENT_LOW_LIGHT_CONSECUTIVE_SAMPLES_TO_SHOW) {
                            nextVisibility = true;
                        }
                    } else if (lux >= AMBIENT_LOW_LIGHT_HIDE_THRESHOLD) {
                        consecutiveAmbientLowLightRef.current = 0;
                        consecutiveAmbientBrightRef.current += 1;
                        if (nextVisibility && consecutiveAmbientBrightRef.current >= AMBIENT_BRIGHT_CONSECUTIVE_SAMPLES_TO_HIDE) {
                            nextVisibility = false;
                        }
                    }

                    if (nextVisibility !== showTorchByAmbientLightRef.current) {
                        showTorchByAmbientLightRef.current = nextVisibility;
                        setShowTorchByAmbientLight(nextVisibility);
                    }
                } else {
                    ambientLightLuxRef.current = null;
                }
            }).catch(() => {
                ambientLightLuxRef.current = null;
            });
        };

        updateAmbientLight();
        ambientTimerRef.current = setInterval(updateAmbientLight, AMBIENT_LIGHT_POLL_INTERVAL_MS);
    }, [isActive, supportsTorch]);

    useEffect(() => {
        if (!isActive) {
            consecutiveAmbientLowLightRef.current = 0;
            consecutiveAmbientBrightRef.current = 0;
            ambientLightLuxRef.current = null;
            showTorchByAmbientLightRef.current = false;
            setShowTorchByAmbientLight(false);
        }
    }, [isActive]);

    const showTorchButton = !cameraRestricted && supportsTorch && (Platform.OS !== 'android' || torchOn || showTorchByAmbientLight);

    const processScannedImage = useCallback(async (imageUri: string) => {
        // 检查原生模块是否可用
        if (!QRCodeScanner || !QRCodeScanner.scanImageAtPath) {
            logInfo('QRCodeScanner 原生模块不可用');
            Alert.alert(
                intl.formatMessage({
                    id: 'mobile.qr_scanner.module_unavailable_title',
                    defaultMessage: 'Feature unavailable',
                }),
                intl.formatMessage({
                    id: 'mobile.qr_scanner.module_unavailable_message',
                    defaultMessage: 'Image scanning is temporarily unavailable. Please use the camera to scan.',
                }),
            );
            return;
        }

        try {
            const codes = await QRCodeScanner.scanImageAtPath(imageUri);

            if (codes && codes.length > 0) {
                const code = codes[0];
                const value = code.value || '';

                logInfo('[QRScanner.processScannedImage] ' + '='.repeat(50));
                logInfo('[QRScanner.processScannedImage] 从图片扫描成功！');
                logInfo('[QRScanner.processScannedImage] 码类型:', code.type);
                logInfo('[QRScanner.processScannedImage] 码内容:', value);
                logInfo('[QRScanner.processScannedImage] ' + '='.repeat(50));

                // 处理扫描结果（使用统一的处理函数）
                processScanResult(value);
            } else {
                Alert.alert(
                    intl.formatMessage({
                        id: 'mobile.qr_scanner.no_code_found_title',
                        defaultMessage: 'No code found',
                    }),
                    intl.formatMessage({
                        id: 'mobile.qr_scanner.no_code_found_message',
                        defaultMessage: 'No QR code or barcode found in the image. Please try again.',
                    }),
                );
            }
        } catch (error) {
            logInfo('[QRScanner.processScannedImage] 扫描图片失败:', error);
            Alert.alert(
                intl.formatMessage({
                    id: 'mobile.qr_scanner.scan_failed_title',
                    defaultMessage: 'Scan failed',
                }),
                intl.formatMessage({
                    id: 'mobile.qr_scanner.scan_failed_message',
                    defaultMessage: 'Could not read the code from the image. Please ensure the image is clear.',
                }),
            );
        }
    }, [intl, processScanResult]);

    const handleImagePickerResponse = useCallback((response: {didCancel?: boolean; errorCode?: string; errorMessage?: string; assets?: Array<{uri?: string}>}) => {
        // 检查组件是否还在挂载
        if (!isMountedRef.current) {
            logInfo('[QRScanner.handleImagePickerResponse] 组件已卸载，忽略图片选择回调');
            return;
        }

        if (response.didCancel) {
            logInfo('[QRScanner.handleImagePickerResponse] 用户取消选择图片');
            return;
        }

        if (response.errorCode) {
            logInfo('[QRScanner.handleImagePickerResponse] 选择图片错误:', response.errorMessage);
            Alert.alert(
                intl.formatMessage({
                    id: 'mobile.qr_scanner.image_error_title',
                    defaultMessage: 'Failed to select image',
                }),
                response.errorMessage || intl.formatMessage({
                    id: 'mobile.qr_scanner.image_error_message',
                    defaultMessage: 'Could not read the image. Please try again.',
                }),
            );
            return;
        }

        if (response.assets && response.assets.length > 0) {
            const asset = response.assets[0];
            const imageUri = asset.uri;

            if (!imageUri) {
                Alert.alert(
                    intl.formatMessage({
                        id: 'mobile.qr_scanner.image_error_title',
                        defaultMessage: 'Failed to select image',
                    }),
                    intl.formatMessage({
                        id: 'mobile.qr_scanner.image_error_message',
                        defaultMessage: 'Could not read the image. Please try again.',
                    }),
                );
                return;
            }

            logInfo('[QRScanner.handleImagePickerResponse] 已选择图片:', imageUri);
            processScannedImage(imageUri);
        }
    }, [intl, processScannedImage]);

    const onImageLibraryResponse = useCallback((response: {didCancel?: boolean; errorCode?: string; errorMessage?: string; assets?: Array<{uri?: string}>}) => {
        logInfo('[QRScanner.handlePickImage] 相册选择完成，恢复相机');

        // 恢复相机（但不恢复手电筒）
        if (isMountedRef.current) {
            setIsImagePickerOpen(false);
        }

        // 处理响应
        handleImagePickerResponse(response);
    }, [handleImagePickerResponse]);

    const openImageLibrary = useCallback(() => {
        logInfo('[QRScanner.handlePickImage] 暂停相机，打开图片选择器');
        setIsImagePickerOpen(true);

        launchImageLibrary({
            mediaType: 'photo',
            quality: 1,
        }, onImageLibraryResponse);
    }, [onImageLibraryResponse]);

    const handlePickImage = useCallback(() => {
        logInfo('[QRScanner.handlePickImage] 打开相册，先关闭手电筒');
        setTorchOn(false);

        // 延迟一下再停止相机，确保手电筒先关闭
        setTimeout(openImageLibrary, 100);
    }, [openImageLibrary]);

    const handleOpenExternalProfileCard = useCallback(() => {
        showModalWithBackButton(
            Screens.EXTERNAL_PROFILE_CARD,
            intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'}),
            'close-external-profile-card',
        );
    }, [intl]);

    if (!hasPermission) {
        return (
            <View style={styles.container}>
                <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                >
                    <CompassIcon
                        name='chevron-left'
                        size={28}
                        color='#FFFFFF'
                    />
                </TouchableOpacity>
                <View style={styles.permissionContainer}>
                    <Text style={styles.permissionText}>
                        {intl.formatMessage({
                            id: 'mobile.qr_scanner.permission_denied',
                            defaultMessage: 'Camera permission is required to use the scanner.',
                        })}
                    </Text>
                    <TouchableOpacity
                        onPress={handleOpenSettings}
                        style={styles.permissionButton}
                    >
                        <Text style={styles.permissionButtonText}>
                            {intl.formatMessage({
                                id: 'mobile.qr_scanner.open_settings',
                                defaultMessage: 'Open Settings',
                            })}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    if (!device) {
        return (
            <View style={styles.container}>
                <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                >
                    <CompassIcon
                        name='chevron-left'
                        size={28}
                        color='#FFFFFF'
                    />
                </TouchableOpacity>
                <Loading color='#09BB07'/>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.cameraContainer}>
                <Camera

                    // @ts-ignore
                    style={StyleSheet.absoluteFill}
                    device={device}
                    isActive={isActive}
                    codeScanner={codeScanner}
                    onError={handleCameraError}
                    torch={supportsTorch && torchOn ? 'on' : 'off'}
                    enableZoomGesture={false}
                    video={false}
                    photo={false}
                    onStarted={() => {
                        logInfo('[QRScanner.Camera] 相机已启动，可以使用手电筒了');
                        setTorchOn(false);
                        setCameraReady(true);
                    }}
                    onStopped={() => {
                        logInfo('[QRScanner.Camera] 相机已停止，关闭手电筒');
                        setTorchOn(false);
                        setCameraReady(false);
                    }}
                />
                <View style={styles.overlay}>
                    <View style={styles.maskTop}/>
                    <View style={styles.maskLeft}/>
                    <View style={styles.scanFrame}/>
                    <View style={styles.maskRight}/>
                    <View style={styles.maskBottom}/>
                </View>
            </View>

            {/* 关闭按钮 */}
            <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
            >
                <CompassIcon
                    name='chevron-left'
                    size={28}
                    color='#FFFFFF'
                />
            </TouchableOpacity>

            {/* 手电筒按钮 - 仅在相机正常工作且设备支持时显示 */}
            {showTorchButton && (
                <TouchableOpacity
                    style={styles.torchButton}
                    onPress={toggleTorch}
                >
                    <CompassIcon
                        name='lightbulb-outline'
                        size={28}
                        color={torchOn ? '#FFD700' : '#FFFFFF'}
                    />
                </TouchableOpacity>
            )}

            {/* 底部操作按钮 */}
            <View style={styles.bottomActions}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handleOpenExternalProfileCard}
                >
                    <View style={styles.actionIcon}>
                        <CompassIcon
                            name='account-outline'
                            size={32}
                            color='#FFFFFF'
                        />
                    </View>
                    <Text style={styles.actionText}>
                        {intl.formatMessage({
                            id: 'external_profile_card.title',
                            defaultMessage: 'External Profile Card',
                        })}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={handlePickImage}
                >
                    <View style={styles.actionIcon}>
                        <CompassIcon
                            name='image-outline'
                            size={32}
                            color='#FFFFFF'
                        />
                    </View>
                    <Text style={styles.actionText}>
                        {intl.formatMessage({
                            id: 'mobile.qr_scanner.select_from_gallery',
                            defaultMessage: 'Select from gallery',
                        })}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default QRScanner;
