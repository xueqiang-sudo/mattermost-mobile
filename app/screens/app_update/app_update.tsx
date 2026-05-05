// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Emm from '@mattermost/react-native-emm';
import React, {useCallback, useMemo, useRef, useState} from 'react';
import {useIntl} from 'react-intl';
import {Text, TouchableOpacity, View} from 'react-native';
import Animated, {runOnJS, SlideInDown, SlideOutDown} from 'react-native-reanimated';

import Button from '@components/button';
import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    updateType: 'suggest' | 'force';
    title: string;
    description: string;
    latestVersion: string;
    onUpdate: () => void;
    onLater?: () => void;
    onDismiss?: () => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    root: {
        flex: 1,
        backgroundColor: changeOpacity('#000000', 0.50),
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
    },
    wrapper: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        flex: 1,
        margin: 10,
        opacity: 1,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    content: {
        marginHorizontal: 24,
        marginBottom: 24,
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingRight: 8,
    },
    close: {
        justifyContent: 'center',
        height: 44,
        width: 40,
        paddingLeft: 16,
        paddingTop: 16,
    },
    versionBadge: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.12),
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginTop: 8,
        marginBottom: 16,
    },
    versionText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonBg,
    },
    title: {
        ...typography('Heading', 600, 'SemiBold'),
        color: theme.centerChannelColor,
        marginTop: 24,
        marginBottom: 8,
        textAlign: 'center',
    },
    description: {
        ...typography('Body', 200, 'Regular'),
        color: changeOpacity(theme.centerChannelColor, 0.72),
        marginBottom: 24,
        textAlign: 'center',
        lineHeight: 22,
    },
    buttonsWrapper: {
        flexDirection: 'row',
        width: '100%',
    },
    singleButton: {
        flex: 1,
    },
    leftButton: {
        flex: 1,
        marginRight: 5,
    },
    rightButton: {
        flex: 1,
        marginLeft: 5,
    },
}));

/**
 * App 更新弹窗组件，支持强制更新和建议更新两种模式
 * - 强制更新：只显示「立即更新」按钮，不可关闭
 * - 建议更新：显示「立即更新」+「稍后再说」按钮，可关闭
 */
const AppUpdate = ({
    componentId,
    updateType,
    title,
    description,
    latestVersion,
    onUpdate,
    onLater,
    onDismiss,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const isForce = updateType === 'force';

    const [show, setShow] = useState(true);
    const executeAfterDone = useRef<() => void>(() => {});

    const close = useCallback((afterDone?: () => void) => {
        executeAfterDone.current = afterDone || (() => {});
        setShow(false);
    }, []);

    /**
     * 点击立即更新：关闭弹窗并跳转到应用商店
     */
    const handleUpdate = useCallback(() => {
        close(() => {
            onUpdate();
        });
    }, [close, onUpdate]);

    /**
     * 点击稍后再说（仅建议更新）：记录跳过并关闭弹窗
     */
    const handleLater = useCallback(() => {
        if (onLater) {
            close(() => {
                onLater();
            });
        }
    }, [close, onLater]);

    /**
     * 点击关闭（仅建议更新）：直接关闭弹窗
     */
    const handleClose = useCallback(() => {
        if (!isForce) {
            close(() => {
                onDismiss?.();
            });
        }
    }, [close, isForce, onDismiss]);

    /**
     * Android 返回键处理：建议更新可关闭，强制更新则退出 App
     */
    const handleBackPress = useCallback(() => {
        if (isForce) {
            Emm.exitApp();
        } else {
            handleClose();
        }
    }, [isForce, handleClose]);

    React.useEffect(() => {
        const {BackHandler} = require('react-native');
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            handleBackPress();
            return true;
        });
        return () => subscription.remove();
    }, [handleBackPress]);

    const doAfterAnimation = useCallback(() => {
        executeAfterDone.current();
    }, []);

    const slideOut = useMemo(() => SlideOutDown.withCallback((finished: boolean) => {
        'worklet';
        if (finished) {
            runOnJS(doAfterAnimation)();
        }
    }), [doAfterAnimation]);

    const updateButtonText = isForce
        ? intl.formatMessage({id: 'mobile.update.force.button', defaultMessage: 'Update Now'})
        : intl.formatMessage({id: 'mobile.update.suggest.button_update', defaultMessage: 'Update Now'});

    const laterButtonText = intl.formatMessage({id: 'mobile.update.suggest.button_later', defaultMessage: 'Later'});

    return (
        <View style={styles.root}>
            <View style={styles.container}>
                {show &&
                    <Animated.View
                        style={styles.wrapper}
                        entering={SlideInDown}
                        exiting={slideOut}
                    >
                        <View style={styles.header}>
                            {!isForce && (
                                <TouchableOpacity
                                    style={styles.close}
                                    onPress={handleClose}
                                >
                                    <CompassIcon
                                        name='close'
                                        size={24}
                                        color={changeOpacity(theme.centerChannelColor, 0.56)}
                                    />
                                </TouchableOpacity>
                            )}
                        </View>
                        <View style={styles.content}>
                            <Text style={styles.title}>
                                {title}
                            </Text>
                            <View style={styles.versionBadge}>
                                <Text style={styles.versionText}>
                                    v{latestVersion}
                                </Text>
                            </View>
                            <Text style={styles.description}>
                                {description}
                            </Text>
                            {isForce ? (
                                <View style={styles.buttonsWrapper}>
                                    <Button
                                        theme={theme}
                                        size={'lg'}
                                        onPress={handleUpdate}
                                        text={updateButtonText}
                                        buttonContainerStyle={styles.singleButton}
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
                                        buttonContainerStyle={styles.leftButton}
                                    />
                                    <Button
                                        theme={theme}
                                        size={'lg'}
                                        onPress={handleUpdate}
                                        text={updateButtonText}
                                        buttonContainerStyle={styles.rightButton}
                                    />
                                </View>
                            )}
                        </View>
                    </Animated.View>
                }
            </View>
        </View>
    );
};

export default AppUpdate;
