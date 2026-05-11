// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Emm from '@mattermost/react-native-emm';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {BackHandler, ScrollView, Text, TouchableOpacity, useWindowDimensions, View} from 'react-native';
import Animated, {FadeIn, SlideInDown, SlideOutDown} from 'react-native-reanimated';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import Button from '@components/button';
import CompassIcon from '@components/compass_icon';
import {dismissOverlay} from '@screens/navigation';
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
}

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
        overflow: 'hidden',
    },
    cardScroll: {
        width: '100%',
        flexGrow: 0,
        flexShrink: 1,
    },
    cardScrollContent: {
        flexGrow: 0,
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
    choiceCardPrimary: {
        borderColor: changeOpacity(theme.buttonBg, 0.4),
        backgroundColor: changeOpacity(theme.buttonBg, 0.06),
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
    choiceIconWrapPrimary: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.15),
    },
    choiceIconWrapSecondary: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    choiceLabel: {
        ...typography('Body', 100, 'SemiBold'),
        textAlign: 'center',
    },
    choiceLabelPrimary: {
        color: theme.buttonBg,
    },
    choiceLabelSecondary: {
        color: theme.centerChannelColor,
    },
    choiceHint: {
        ...typography('Body', 50, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.48),
        textAlign: 'center',
        marginTop: 4,
        lineHeight: 16,
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
}: Props) => {
    const intl = useIntl();
    const styles = getStyleSheet(theme);
    const {height: windowHeight} = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const isForce = updateType === 'force';
    const [showStoreChoice, setShowStoreChoice] = useState(false);

    const cardMaxHeight = useMemo(() => {
        return Math.max(240, windowHeight - insets.top - insets.bottom - CARD_SCREEN_MARGIN_V);
    }, [windowHeight, insets.top, insets.bottom]);

    const dismiss = useCallback(() => {
        logDebug('[AppUpdate.dismiss] called');
        dismissOverlay(UPDATE_OVERLAY_ID).catch(() => {/* ignore */});
    }, []);

    /**
     * 点击立即更新：有应用商店则展示选择界面，否则直接更新
     */
    const handleUpdate = useCallback(() => {
        logDebug('[AppUpdate.handleUpdate] called', {hasAppStore});
        if (hasAppStore) {
            setShowStoreChoice(true);
        } else {
            dismiss();
            onUpdate();
        }
    }, [dismiss, onUpdate, hasAppStore]);

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
        logDebug('[AppUpdate.handleApkUpdate] called');
        dismiss();
        onUpdate();
    }, [dismiss, onUpdate]);

    /**
     * 选择应用商店更新
     */
    const handleStoreUpdate = useCallback(() => {
        logDebug('[AppUpdate.handleStoreUpdate] called');
        dismiss();
        onStoreUpdate?.();
    }, [dismiss, onStoreUpdate]);

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
    const storeHintText = intl.formatMessage({id: 'mobile.update.android.store_hint', defaultMessage: 'Recommended'});
    const apkHintText = intl.formatMessage({id: 'mobile.update.android.apk_hint', defaultMessage: 'Direct download'});
    const choiceTitleText = intl.formatMessage({id: 'mobile.update.android.choice_title', defaultMessage: 'Choose Update Method'});

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
                <Text style={styles.choiceHint}>
                    {storeHintText}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.choiceCard, styles.choiceCardPrimary]}
                onPress={handleApkUpdate}
                activeOpacity={0.7}
                testID='app_update.apk'
                accessibilityRole='button'
            >
                <View style={[styles.choiceIconWrap, styles.choiceIconWrapPrimary]}>
                    <CompassIcon
                        name='download-outline'
                        size={20}
                        color={theme.buttonBg}
                    />
                </View>
                <Text style={[styles.choiceLabel, styles.choiceLabelPrimary]}>
                    {apkUpdateText}
                </Text>
                <Text style={styles.choiceHint}>
                    {apkHintText}
                </Text>
            </TouchableOpacity>
        </Animated.View>
    );

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
                <Animated.View
                    style={[styles.wrapper, {maxHeight: cardMaxHeight}]}
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
                    <ScrollView
                        style={styles.cardScroll}
                        contentContainerStyle={[styles.inner, !isForce && styles.innerWithClose, styles.cardScrollContent]}
                        nestedScrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                        keyboardShouldPersistTaps='handled'
                        testID='app_update.card_scroll'
                    >
                        {showStoreChoice ? (
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
                            renderUpdateInfoContent()
                        )}
                    </ScrollView>
                </Animated.View>
            </View>
        </View>
    );
};

export default AppUpdate;
