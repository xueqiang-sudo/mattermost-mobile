// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {DeviceEventEmitter, TouchableOpacity, View} from 'react-native';

import {switchToGlobalThreads} from '@actions/local/thread';
import Badge from '@components/badge';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {
    getStyleSheet as getChannelItemStyleSheet,
    ROW_HEIGHT,
    textStyle as channelItemTextStyle,
} from '@components/channel_item/channel_item';
import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {Events, Screens} from '@constants';
import {THREAD} from '@constants/screens';
import {HOME_PADDING} from '@constants/view';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {usePreventDoubleTap} from '@hooks/utils';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    icon: {
        color: changeOpacity(theme.sidebarText, 0.5),
        fontSize: 24,
        marginRight: 12,
    },
    headerButton: {
        backgroundColor: changeOpacity(theme.sidebarText, 0.08),
        height: PLUS_BUTTON_SIZE,
        width: PLUS_BUTTON_SIZE,
        borderRadius: PLUS_BUTTON_SIZE / 2,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    iconActive: {
        color: theme.sidebarText,
    },
    iconInfo: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
    },
    text: {
        flex: 1,
    },
}));

const PLUS_BUTTON_SIZE = 28;

type Props = {
    currentChannelId: string;
    lastChannelId?: string;
    onCenterBg?: boolean;
    onPress?: () => void;
    shouldHighlightActive?: boolean;
    unreadsAndMentions: {
        unreads: boolean;
        mentions: number;
    };
    isOnHome?: boolean;
    /** 紧凑图标模式，用于 header 右侧按钮区 */
    variant?: 'list' | 'header';
};

const ThreadsButton = ({
    currentChannelId,
    lastChannelId,
    onCenterBg,
    onPress,
    unreadsAndMentions,
    shouldHighlightActive = false,
    isOnHome = false,
    variant = 'list',
}: Props) => {
    const isTablet = useIsTablet();
    const serverUrl = useServerUrl();

    const theme = useTheme();
    const styles = getChannelItemStyleSheet(theme);
    const customStyles = getStyleSheet(theme);

    const handlePress = usePreventDoubleTap(useCallback(() => {
        DeviceEventEmitter.emit(Events.ACTIVE_SCREEN, THREAD);
        if (onPress) {
            onPress();
        } else {
            switchToGlobalThreads(serverUrl);
        }
    }, [onPress, serverUrl]));

    const {unreads, mentions} = unreadsAndMentions;
    const isActive = isTablet && ((shouldHighlightActive && !currentChannelId) || (!currentChannelId && lastChannelId === Screens.GLOBAL_THREADS));

    const [containerStyle, iconStyle, textStyle, badgeStyle] = useMemo(() => {
        const container = [
            styles.container,
            isOnHome && HOME_PADDING,
            isActive && styles.activeItem,
            isActive && isOnHome && {
                paddingLeft: HOME_PADDING.paddingLeft - styles.activeItem.borderLeftWidth,
            },
            {minHeight: ROW_HEIGHT},
        ];

        const icon = [
            customStyles.icon,
            (isActive || unreads) && customStyles.iconActive,
            onCenterBg && customStyles.iconInfo,
        ];

        const text = [
            customStyles.text,
            unreads ? channelItemTextStyle.bold : channelItemTextStyle.regular,
            styles.text,
            unreads && styles.highlight,
            isActive && styles.textActive,
            onCenterBg && styles.textOnCenterBg,
        ];

        const badge = [
            styles.badge,
            onCenterBg && styles.badgeOnCenterBg,
        ];

        return [container, icon, text, badge];
    }, [customStyles, isActive, onCenterBg, styles, unreads, isOnHome]);

    if (variant === 'header') {
        return (
            <TouchableWithFeedback
                onPress={handlePress}
                style={[customStyles.headerButton, (isActive || unreads) && {backgroundColor: changeOpacity(theme.sidebarText, 0.16)}]}
                testID='channel_list.threads.button'
                type='opacity'
            >
                <View style={{position: 'relative'}}>
                    <CompassIcon
                        name='message-text-outline'
                        style={[customStyles.icon, {fontSize: 18, marginRight: 0}, (isActive || unreads) && customStyles.iconActive]}
                    />
                    {mentions > 0 && (
                        <View style={{position: 'absolute', top: -4, right: -4}}>
                            <Badge value={mentions} style={badgeStyle} visible={true} />
                        </View>
                    )}
                </View>
            </TouchableWithFeedback>
        );
    }

    return (
        <TouchableOpacity
            onPress={handlePress}
            testID='channel_list.threads.button'
        >
            <View style={containerStyle}>
                <CompassIcon
                    name='message-text-outline'
                    style={iconStyle}
                />
                <FormattedText
                    id='threads'
                    defaultMessage='Threads'
                    style={textStyle}
                />
                <Badge
                    value={mentions}
                    style={badgeStyle}
                    visible={mentions > 0}
                />
            </View>
        </TouchableOpacity>
    );
};

export default React.memo(ThreadsButton);
