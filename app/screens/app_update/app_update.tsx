// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Emm from '@mattermost/react-native-emm';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {BackHandler, NativeModules, ScrollView, Text, TouchableOpacity, useWindowDimensions, View, type LayoutChangeEvent} from 'react-native';
import Animated, {FadeIn, SlideInDown, SlideOutDown} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import Button from '@components/button';
import CompassIcon from '@components/compass_icon';
import {dismissOverlay} from '@screens/navigation';
import {computeDownloadPercent, downloadApk} from '@utils/file/apk_download';
import {logDebug} from '@utils/log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';
import type {Theme} from '@typings/theme';

const SCREEN_PADDING_H = 20;
const SECTION_GAP = 16;
const CARD_CORNER = 16;
const HERO_SIZE = 56;
const DESCRIPTION_MAX_HEIGHT = 168;
const CHOICE_GAP = 12;
const CARD_SCREEN_MARGIN_V = 16 + 16;

type Props = {
    componentId: AvailableScreens;
    updateType: 'suggest' | 'force';
    title: string;
    description: string;
    latestVersion: string;
    theme: Theme;
    onUpdate: () => void;
    onLater?: () => void;
    onDismiss?: () => void;

    /** 是否有可用的应用商店（仅 Android，检测 market:// 协议是否可打开） */
    hasAppStore?: boolean;

    /** 应用商店更新回调（仅 Android 双按钮模式） */
    onStoreUpdate?: () => void;

    /** APK 远程下载地址（Android 内部分发场景），传入后触发应用内下载 */
    downloadUrl?: string;
}

type DownloadState = 'idle' | 'downloading' | 'completed' | 'error' | 'install_error';

type InstallSubtextKind = 'countdown' | 'auto' | 'manual';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    root: {
        flex: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.5),
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        flex: 1,
        maxWidth: 680,
        alignSelf: 'center',
        alignContent: 'center',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        flexDirection: 'row',
        paddingHorizontal: SCREEN_PADDING_H,
    },
    wrapper: {
        position: 'relative',
        width: '88%',
        flexShrink: 1,
        backgroundColor: theme.centerChannelBg,
        borderRadius: CARD_CORNER,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        overflow: 'auto',
    },
    /** 初始更新说明页需滚动；勿在 flex 父级下默认撑满高度 */
    cardScroll: {
        width: '100%',
        flexGrow: 0,
        flexShrink: 1,
        flex: 0,
    },
    cardScrollContent: {
        flexGrow: 0,
    },
    /** 选择方式 / 下载流程：按内容高度收缩，不用 ScrollView 作外层 */
    cardBodyShrink: {
        width: '100%',
        flexGrow: 0,
        flexShrink: 0,
    },
    closeButton: {
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 2,
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    inner: {
        paddingHorizontal: SCREEN_PADDING_H,
        paddingTop: SECTION_GAP,
        paddingBottom: 32,
        alignItems: 'center',
    },
    innerWithClose: {
        paddingTop: 40,
    },
    hero: {
        width: HERO_SIZE,
        height: HERO_SIZE,
        borderRadius: HERO_SIZE / 2,
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SECTION_GAP,
    },
    title: {
        ...typography('Heading', 500, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
        textAlign: 'center',
    },
    versionBadge: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginBottom: SECTION_GAP,
    },
    versionText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    descriptionScroll: {
        width: '100%',
        maxHeight: DESCRIPTION_MAX_HEIGHT,
        marginBottom: SECTION_GAP,
    },
    descriptionScrollContent: {
        paddingBottom: 4,
    },
    description: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        textAlign: 'center',
        lineHeight: 22,
    },
    buttonsWrapper: {
        flexDirection: 'row',
        width: '100%',
        columnGap: 12,
    },
    singleButton: {
        flex: 1,
    },
    dualButton: {
        flex: 1,
    },

    /** 选择更新方式界面 */
    choiceTitle: {
        ...typography('Heading', 500, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 6,
        textAlign: 'center',
    },
    choiceSubtitle: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textAlign: 'center',
        marginBottom: SECTION_GAP,
    },
    choiceWrapper: {
        flexDirection: 'row',
        width: '100%',
        columnGap: CHOICE_GAP,
    },
    choiceCard: {
        flex: 1,
        borderRadius: 12,
        borderWidth: 1.5,
        paddingVertical: 14,
        paddingHorizontal: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    choiceCardSecondary: {
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    choiceIconWrap: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    choiceIconWrapSecondary: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    choiceLabel: {
        ...typography('Body', 100, 'SemiBold'),
        textAlign: 'center',
    },
    choiceLabelSecondary: {
        color: theme.centerChannelColor,
    },

    /** 下载进度区域 */
    downloadContainer: {
        justifyContent: 'flex-start',
        width: '100%',
        alignItems: 'center',
        paddingVertical: 16,
    },
    downloadIconContainer: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 20,
    },
    downloadTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 20,
    },
    downloadCompleteText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    downloadErrorText: {
        ...typography('Body', 100, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 22,
    },
    progressBarBg: {
        width: '100%',
        height: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 12,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: theme.buttonBg,
        borderRadius: 3,
    },
    progressPercentText: {
        ...typography('Heading', 500, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 20,
    },
    progressStatusText: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        marginBottom: 20,
    },
    countdownText: {
        ...typography('Body', 75, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginBottom: 16,
    },
    cancelButton: {
        flex: 1,
    },
    downloadErrorButtons: {
        flexDirection: 'row',
        width: '100%',
        columnGap: 12,
    },
}));

const UPDATE_OVERLAY_ID = 'AppUpdateOverlay';

/**
 * App 更新弹窗组件
 * - 初始显示「立即更新」按钮（+ 可选「稍后再说」）
 * - Android 有应用商店时：点击立即更新 → 替换为选择更新方式界面
 * - 无应用商店 / iOS：点击立即更新 → 直接执行更新
 */
const AppUpdate = ({
    componentId: _componentId,
    updateType,
    title,
    description,
    latestVersion,
    theme,
    onUpdate,
    onLater,
    onDismiss,
    hasAppStore,
    onStoreUpdate,
    downloadUrl,
}: Props) => {
    const intl = useIntl();
    const styles = getStyleSheet(theme);
    const {height: windowHeight} = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isForce = updateType === 'force';
    const [showStoreChoice, setShowStoreChoice] = useState(false);

    const [downloadState, setDownloadState] = useState<DownloadState>('idle');
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadedFilePath, setDownloadedFilePath] = useState('');
    const [choiceBodyHeight, setChoiceBodyHeight] = useState(0);
    const downloadCancelRef = useRef<(() => void) | null>(null);
    const [countdownSeconds, setCountdownSeconds] = useState(0);
    const [installSubtextKind, setInstallSubtextKind] = useState<InstallSubtextKind>('countdown');
    const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const runNativeInstallRef = useRef<(() => Promise<void>) | null>(null);

    const AUTO_INSTALL_COUNTDOWN = 5;

    const clearCountdownTimer = useCallback(() => {
        if (countdownTimerRef.current !== null) {
            clearTimeout(countdownTimerRef.current);
            countdownTimerRef.current = null;
        }
    }, []);

    useEffect(() => {
        return () => {
            clearCountdownTimer();
        };
    }, [clearCountdownTimer]);

    /**
     * 下载完成后倒计时；归零时在微任务中切换为自动安装文案并触发原生安装
     */
    useEffect(() => {
        if (downloadState === 'completed' && countdownSeconds > 0) {
            clearCountdownTimer();
            countdownTimerRef.current = setTimeout(() => {
                setCountdownSeconds((prev) => {
                    if (prev <= 1) {
                        queueMicrotask(() => {
                            setInstallSubtextKind('auto');
                            void runNativeInstallRef.current?.();
                        });
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => {
            clearCountdownTimer();
        };
    }, [downloadState, countdownSeconds, clearCountdownTimer]);

    const cardMaxHeight = useMemo(() => {
        return Math.max(240, windowHeight - insets.top - insets.bottom - CARD_SCREEN_MARGIN_V);
    }, [windowHeight, insets.top, insets.bottom]);

    const handleChoiceBodyLayout = useCallback((event: LayoutChangeEvent) => {
        const nextHeight = Math.ceil(event.nativeEvent.layout.height);
        setChoiceBodyHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    }, []);

    const dismiss = useCallback(() => {
        logDebug('[AppUpdate.dismiss] called');
        dismissOverlay(UPDATE_OVERLAY_ID).catch(() => {/* ignore */});
    }, []);

    /**
     * 开始应用内下载 APK
     */
    const startDownload = useCallback(() => {
        if (!downloadUrl) {
            return;
        }
        logDebug('[AppUpdate.startDownload] starting', {downloadUrl});
        setDownloadState('downloading');
        setDownloadProgress(0);
        setInstallSubtextKind('countdown');

        const result = downloadApk(
            downloadUrl,
            (progress) => {
                const percent = computeDownloadPercent(progress);
                setDownloadProgress(percent);
            },
            (fileUri) => {
                logDebug('[AppUpdate.startDownload] completed', {fileUri});
                setDownloadedFilePath(fileUri);
                setInstallSubtextKind('countdown');
                setCountdownSeconds(AUTO_INSTALL_COUNTDOWN);
                setDownloadState('completed');
            },
            (error) => {
                logDebug('[AppUpdate.startDownload] error', {error: error.message});
                setDownloadState('error');
            },
        );
        downloadCancelRef.current = result.cancel;
    }, [downloadUrl]);

    /**
     * 点击立即更新：有应用商店则展示选择界面；无商店但有 APK 地址则进入同一套下载 UI（须先 showStoreChoice，否则界面仍停在首屏）
     */
    const handleUpdate = useCallback(() => {
        logDebug('[AppUpdate.handleUpdate] called', {hasAppStore, hasDownloadUrl: Boolean(downloadUrl)});
        if (hasAppStore) {
            setShowStoreChoice(true);
        } else if (downloadUrl) {
            setShowStoreChoice(true);
            startDownload();
        } else {
            dismiss();
            onUpdate();
        }
    }, [dismiss, onUpdate, hasAppStore, downloadUrl, startDownload]);

    /**
     * 点击稍后再说（仅建议更新）
     */
    const handleLater = useCallback(() => {
        logDebug('[AppUpdate.handleLater] called');
        dismiss();
        onLater?.();
    }, [dismiss, onLater]);

    /**
     * 点击关闭（仅建议更新）
     */
    const handleClose = useCallback(() => {
        logDebug('[AppUpdate.handleClose] called');
        if (!isForce) {
            dismiss();
            onDismiss?.();
        }
    }, [dismiss, isForce, onDismiss]);

    /**
     * 选择 APK 直接下载更新
     */
    const handleApkUpdate = useCallback(() => {
        logDebug('[AppUpdate.handleApkUpdate] called', {hasDownloadUrl: Boolean(downloadUrl)});
        if (downloadUrl) {
            startDownload();
        } else {
            dismiss();
            onUpdate();
        }
    }, [dismiss, onUpdate, downloadUrl, startDownload]);

    /**
     * 选择应用商店更新
     */
    const handleStoreUpdate = useCallback(() => {
        logDebug('[AppUpdate.handleStoreUpdate] called');
        onStoreUpdate?.();
    }, [onStoreUpdate]);

    /**
     * 调用原生模块触发 APK 安装（自动倒计时结束与用户点击共用）
     */
    const runNativeInstall = useCallback(async () => {
        if (!downloadedFilePath) {
            return;
        }
        clearCountdownTimer();
        logDebug('[AppUpdate.runNativeInstall] installing', {filePath: downloadedFilePath});
        try {
            const {ApkInstaller} = NativeModules;
            if (ApkInstaller?.installApk) {
                await ApkInstaller.installApk(downloadedFilePath);
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            logDebug('[AppUpdate.runNativeInstall] error', {error: msg});
            setDownloadState('install_error');
        }
    }, [downloadedFilePath, clearCountdownTimer]);

    runNativeInstallRef.current = runNativeInstall;

    /**
     * 用户点击「安装」：展示手动安装说明后执行安装
     */
    const handleInstallPress = useCallback(() => {
        setInstallSubtextKind('manual');
        void runNativeInstall();
    }, [runNativeInstall]);

    /**
     * 下载失败后重试
     */
    const handleRetry = useCallback(() => {
        logDebug('[AppUpdate.handleRetry] called');
        startDownload();
    }, [startDownload]);

    /**
     * 取消下载
     */
    const handleCancelDownload = useCallback(() => {
        logDebug('[AppUpdate.handleCancelDownload] called');
        clearCountdownTimer();
        downloadCancelRef.current?.();
        setDownloadState('idle');
        setCountdownSeconds(0);
        setInstallSubtextKind('countdown');

        // 无应用商店、仅 APK 流程：取消/返回后回到首屏说明，不留在「选择更新方式」
        if (!hasAppStore) {
            setShowStoreChoice(false);
        }
    }, [clearCountdownTimer, hasAppStore]);

    /**
     * Android 返回键处理
     */
    const handleBackPress = useCallback(() => {
        logDebug('[AppUpdate.handleBackPress]', {isForce, showStoreChoice});
        if (isForce) {
            Emm.exitApp();
        } else {
            handleClose();
        }
        return true;
    }, [isForce, handleClose, showStoreChoice]);

    const handleBackPressRef = useRef(handleBackPress);
    handleBackPressRef.current = handleBackPress;

    useEffect(() => {
        let subscription: ReturnType<typeof BackHandler.addEventListener> | null = null;
        const timer = setTimeout(() => {
            logDebug('[AppUpdate] BackHandler enabled');
            subscription = BackHandler.addEventListener('hardwareBackPress', () => {
                return handleBackPressRef.current();
            });
        }, 300);
        return () => {
            clearTimeout(timer);
            subscription?.remove();
        };
    }, []);

    const updateButtonText = isForce
        ? intl.formatMessage({id: 'mobile.update.force.button', defaultMessage: 'Update Now'})
        : intl.formatMessage({id: 'mobile.update.suggest.button_update', defaultMessage: 'Update Now'});

    const laterButtonText = intl.formatMessage({id: 'mobile.update.suggest.button_later', defaultMessage: 'Later'});

    const apkUpdateText = intl.formatMessage({id: 'mobile.update.android.apk_update', defaultMessage: 'APK Update'});
    const storeUpdateText = intl.formatMessage({id: 'mobile.update.android.store_update', defaultMessage: 'App Store Update'});
    const choiceTitleText = intl.formatMessage({id: 'mobile.update.android.choice_title', defaultMessage: 'Choose Update Method'});

    const downloadingText = intl.formatMessage({id: 'mobile.update.android.downloading', defaultMessage: 'Downloading update...'});
    const downloadCompleteText = intl.formatMessage({id: 'mobile.update.android.download_complete', defaultMessage: 'Download complete'});
    const downloadFailedText = intl.formatMessage({id: 'mobile.update.android.download_failed', defaultMessage: 'Download failed, please try again'});
    const installText = intl.formatMessage({id: 'mobile.update.android.install', defaultMessage: 'Install'});
    const retryText = intl.formatMessage({id: 'mobile.update.android.retry', defaultMessage: 'Retry'});
    const cancelDownloadText = intl.formatMessage({id: 'mobile.update.android.cancel_download', defaultMessage: 'Cancel'});
    const installErrorText = intl.formatMessage({id: 'mobile.update.android.install_error', defaultMessage: 'Install failed, please try again'});

    /**
     * 渲染选择更新方式界面（替换原有内容）
     */
    const renderChoiceContent = () => (
        <Animated.View
            style={styles.choiceWrapper}
            entering={FadeIn.duration(200)}
        >
            <TouchableOpacity
                style={[styles.choiceCard, styles.choiceCardSecondary]}
                onPress={handleStoreUpdate}
                activeOpacity={0.7}
                testID='app_update.store'
                accessibilityRole='button'
            >
                <View style={[styles.choiceIconWrap, styles.choiceIconWrapSecondary]}>
                    <CompassIcon
                        name='open-in-new'
                        size={20}
                        color={changeOpacity(theme.centerChannelColor, 0.64)}
                    />
                </View>
                <Text style={[styles.choiceLabel, styles.choiceLabelSecondary]}>
                    {storeUpdateText}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.choiceCard, styles.choiceCardSecondary]}
                onPress={handleApkUpdate}
                activeOpacity={0.7}
                testID='app_update.apk'
                accessibilityRole='button'
            >
                <View style={[styles.choiceIconWrap, styles.choiceIconWrapSecondary]}>
                    <CompassIcon
                        name='download-outline'
                        size={20}
                        color={changeOpacity(theme.centerChannelColor, 0.64)}
                    />
                </View>
                <Text style={[styles.choiceLabel, styles.choiceLabelSecondary]}>
                    {apkUpdateText}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );

    /**
     * 渲染下载进度 / 完成 / 错误界面
     */
    const renderDownloadContent = () => {
        switch (downloadState) {
            case 'downloading':
                return (
                    <Animated.View
                        style={styles.downloadContainer}
                        entering={FadeIn.duration(200)}
                    >
                        <View style={styles.downloadIconContainer}>
                            <CompassIcon
                                name='download-outline'
                                size={28}
                                color={theme.buttonBg}
                            />
                        </View>
                        <Text style={styles.downloadTitle}>
                            {downloadingText}
                        </Text>
                        <View style={styles.progressBarBg}>
                            <View style={[styles.progressBarFill, {width: `${downloadProgress}%`}]}/>
                        </View>
                        <Text style={styles.progressPercentText}>
                            {`${downloadProgress}%`}
                        </Text>
                        <View style={styles.buttonsWrapper}>
                            <Button
                                theme={theme}
                                size={'lg'}
                                emphasis={'tertiary'}
                                onPress={handleCancelDownload}
                                text={cancelDownloadText}
                                buttonContainerStyle={styles.cancelButton}
                                testID='app_update.cancel_download'
                            />
                        </View>
                    </Animated.View>
                );
            case 'completed':
                return (
                    <Animated.View
                        style={styles.downloadContainer}
                        entering={FadeIn.duration(200)}
                    >
                        <View style={styles.downloadIconContainer}>
                            <CompassIcon
                                name='check-circle'
                                size={28}
                                color={theme.buttonBg}
                            />
                        </View>
                        <Text style={styles.downloadCompleteText}>
                            {downloadCompleteText}
                        </Text>
                        {installSubtextKind === 'manual' ? (
                            <Text style={styles.countdownText}>
                                {intl.formatMessage({
                                    id: 'mobile.update.android.install_prompt_manual',
                                    defaultMessage: 'Follow the system prompts to complete installation.',
                                })}
                            </Text>
                        ) : installSubtextKind === 'auto' || (installSubtextKind === 'countdown' && countdownSeconds === 0) ? (
                            <Text style={styles.countdownText}>
                                {intl.formatMessage({
                                    id: 'mobile.update.android.install_prompt_auto',
                                    defaultMessage: 'System installer is open. Follow the prompts to finish installation.',
                                })}
                            </Text>
                        ) : installSubtextKind === 'countdown' && countdownSeconds > 0 ? (
                            <Text style={styles.countdownText}>
                                {intl.formatMessage(
                                    {id: 'mobile.update.android.auto_install_countdown', defaultMessage: 'Will auto install in {countdownSeconds}s'},
                                    {countdownSeconds},
                                )}
                            </Text>
                        ) : null}
                        <View style={styles.buttonsWrapper}>
                            <Button
                                theme={theme}
                                size={'lg'}
                                onPress={handleInstallPress}
                                text={installText}
                                buttonContainerStyle={styles.singleButton}
                                testID='app_update.install'
                            />
                        </View>
                    </Animated.View>
                );
            case 'error':
            case 'install_error':
                return (
                    <Animated.View
                        style={styles.downloadContainer}
                        entering={FadeIn.duration(200)}
                    >
                        <View style={styles.downloadIconContainer}>
                            <CompassIcon
                                name='alert-circle-outline'
                                size={28}
                                color={changeOpacity(theme.centerChannelColor, 0.56)}
                            />
                        </View>
                        <Text style={styles.downloadErrorText}>
                            {downloadState === 'install_error' ? installErrorText : downloadFailedText}
                        </Text>
                        <View style={styles.downloadErrorButtons}>
                            <Button
                                theme={theme}
                                size={'lg'}
                                emphasis={'tertiary'}
                                onPress={handleCancelDownload}
                                text={intl.formatMessage({id: 'mobile.update.android.back', defaultMessage: 'Back'})}
                                buttonContainerStyle={styles.dualButton}
                                testID='app_update.back'
                            />
                            <Button
                                theme={theme}
                                size={'lg'}
                                onPress={handleRetry}
                                text={retryText}
                                buttonContainerStyle={styles.dualButton}
                                testID='app_update.retry'
                            />
                        </View>
                    </Animated.View>
                );
            default:
                return null;
        }
    };

    /**
     * 渲染初始更新信息界面
     */
    const renderUpdateInfoContent = () => (
        <>
            <View style={styles.hero}>
                <CompassIcon
                    name='update'
                    size={28}
                    color={theme.buttonBg}
                />
            </View>
            <Text style={styles.title}>
                {title}
            </Text>
            <View style={styles.versionBadge}>
                <Text style={styles.versionText}>
                    {`v${latestVersion}`}
                </Text>
            </View>
            <ScrollView
                style={styles.descriptionScroll}
                contentContainerStyle={styles.descriptionScrollContent}
                showsVerticalScrollIndicator={true}
                nestedScrollEnabled={true}
                testID='app_update.description_scroll'
            >
                <Text style={styles.description}>
                    {description}
                </Text>
            </ScrollView>
            {isForce ? (
                <View style={styles.buttonsWrapper}>
                    <Button
                        theme={theme}
                        size={'lg'}
                        onPress={handleUpdate}
                        text={updateButtonText}
                        buttonContainerStyle={styles.singleButton}
                        testID='app_update.update'
                    />
                </View>
            ) : (
                <View style={styles.buttonsWrapper}>
                    <Button
                        theme={theme}
                        size={'lg'}
                        emphasis={'tertiary'}
                        onPress={handleLater}
                        text={laterButtonText}
                        buttonContainerStyle={styles.dualButton}
                        testID='app_update.later'
                    />
                    <Button
                        theme={theme}
                        size={'lg'}
                        onPress={handleUpdate}
                        text={updateButtonText}
                        buttonContainerStyle={styles.dualButton}
                        testID='app_update.update'
                    />
                </View>
            )}
        </>
    );

    return (
        <View style={styles.root}>
            <View style={styles.container}>
                <View
                    style={[
                        styles.wrapper,
                        showStoreChoice && choiceBodyHeight > 0 && {height: choiceBodyHeight},
                        !showStoreChoice && {maxHeight: cardMaxHeight},
                    ]}
                    entering={SlideInDown}
                    exiting={SlideOutDown}
                >
                    {!isForce && (
                        <TouchableOpacity
                            style={styles.closeButton}
                            onPress={handleClose}
                            testID='app_update.close'
                            accessibilityRole='button'
                            accessibilityLabel={intl.formatMessage({id: 'channel_info.close', defaultMessage: 'Close'})}
                            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
                        >
                            <CompassIcon
                                name='close'
                                size={22}
                                color={changeOpacity(theme.centerChannelColor, 0.56)}
                            />
                        </TouchableOpacity>
                    )}
                    {showStoreChoice ? (
                        <View
                            style={[styles.inner, !isForce && styles.innerWithClose, styles.cardBodyShrink]}
                            onLayout={handleChoiceBodyLayout}
                            testID='app_update.card_body'
                        >
                            {downloadState === 'idle' ? (
                                <Animated.View entering={FadeIn.duration(200)}>
                                    <Text style={styles.choiceTitle}>
                                        {choiceTitleText}
                                    </Text>
                                    <Text style={styles.choiceSubtitle}>
                                        {`v${latestVersion}`}
                                    </Text>
                                    {renderChoiceContent()}
                                </Animated.View>
                            ) : (
                                <Animated.View
                                    style={{width: '100%'}}
                                    entering={FadeIn.duration(200)}
                                >
                                    <Text style={styles.choiceTitle}>
                                        {choiceTitleText}
                                    </Text>
                                    <Text style={styles.choiceSubtitle}>
                                        {`v${latestVersion}`}
                                    </Text>
                                    {renderDownloadContent()}
                                </Animated.View>
                            )}
                        </View>
                    ) : (
                        <ScrollView
                            style={styles.cardScroll}
                            contentContainerStyle={[styles.inner, !isForce && styles.innerWithClose, styles.cardScrollContent]}
                            nestedScrollEnabled={true}
                            showsVerticalScrollIndicator={true}
                            keyboardShouldPersistTaps='handled'
                            testID='app_update.card_scroll'
                        >
                            {renderUpdateInfoContent()}
                        </ScrollView>
                    )}
                </View>
            </View>
        </View>
    );
};

export default AppUpdate;
