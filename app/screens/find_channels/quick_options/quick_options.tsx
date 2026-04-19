// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Platform, View} from 'react-native';
import Animated, {FadeInDown, FadeOutUp} from 'react-native-reanimated';

import CompassIcon from '@components/compass_icon';
import OptionBox, {OPTIONS_HEIGHT} from '@components/option_box';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import {showModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

type Props = {
    canCreateChannels: boolean;
    close: () => Promise<void>;
}

/**
 * 获取快速选项的样式
 */
const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        marginTop: 8,
        marginBottom: 16,
        alignItems: 'center',
    },
    wrapper: {
        flexDirection: 'row',
        height: OPTIONS_HEIGHT,
    },
    separator: {
        width: 12,
    },
}));

/**
 * 快速选项组件
 */
const QuickOptions = ({canCreateChannels, close}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const intl = useIntl();

    /**
     * 创建新频道
     */
    const createNewChannel = useCallback(async () => {
        const title = intl.formatMessage({id: 'mobile.create_channel.title', defaultMessage: 'New channel'});

        await close();
        showModal(Screens.CREATE_OR_EDIT_CHANNEL, title);
    }, [intl]);

    /**
     * 打开私信
     */
    const openDirectMessage = useCallback(async () => {
        const title = intl.formatMessage({id: 'create_direct_message.title', defaultMessage: 'Create Direct Message'});
        const closeIconColor = changeOpacity(theme.centerChannelColor, 0.72);
        const closeButton = await CompassIcon.getImageSource('close', 24, closeIconColor);

        await close();
        showModal(Screens.CREATE_DIRECT_MESSAGE, title, {
            closeButton,
        }, {
            topBar: {
                background: {color: theme.centerChannelBg},
                title: {color: theme.centerChannelColor},
                leftButtonColor: closeIconColor,
            },
            statusBar: {
                backgroundColor: theme.centerChannelBg,
            },
        });
    }, [intl, theme]);

    return (
        <Animated.View
            entering={FadeInDown.duration(250)}
            exiting={Platform.select({ios: FadeOutUp.duration(150)}) /* https://mattermost.atlassian.net/browse/MM-63814?focusedCommentId=178584 */}
            style={styles.container}
        >
            <Animated.View style={styles.wrapper}>
                <OptionBox
                    iconName='account-outline'
                    onPress={openDirectMessage}
                    text={intl.formatMessage({id: 'find_channels.open_dm', defaultMessage: 'Start a private chat or group discussion'})}
                    testID='find_channels.quick_options.open_dm.option'
                />
                {canCreateChannels &&
                <>
                    <View style={styles.separator}/>
                    <OptionBox
                        iconName='plus'
                        onPress={createNewChannel}
                        text={intl.formatMessage({id: 'find_channels.new_channel', defaultMessage: 'New group chat'})}
                        testID='find_channels.quick_options.new_channel.option'
                    />
                </>
                }
            </Animated.View>
        </Animated.View>
    );
};

export default QuickOptions;
