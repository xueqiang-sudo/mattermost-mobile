// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {View} from 'react-native';
import {type Edge, SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {General} from '@constants';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

interface ReadOnlyProps {
    testID?: string;
    channelType?: ChannelType;
    channelName?: string;
}

const getStyle = makeStyleSheetFromTheme((theme: Theme) => ({
    wrapper: {
        backgroundColor: theme.centerChannelBg,
    },
    background: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    container: {
        alignItems: 'center',
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.20),
        borderTopWidth: 1,
        flexDirection: 'row',
        height: 50,
        paddingHorizontal: 12,
    },
    icon: {
        fontSize: 20,
        lineHeight: 22,
        opacity: 0.56,
    },
    text: {
        color: theme.centerChannelColor,
        fontSize: 15,
        lineHeight: 20,
        marginLeft: 9,
        opacity: 0.56,
    },
}));

/**
 * 获取只读提示的文案 key，根据频道类型区分私聊、群聊、内部群、企业总群
 * @param channelType - 频道类型
 * @param channelName - 频道名称（用于判断企业总群）
 * @returns i18n key
 */
function getReadOnlyMessageKey(channelType: ChannelType | undefined, channelName: string | undefined): {id: string; defaultMessage: string} {
    // 企业总群判断：name === 'town-square'
    if (channelName === General.DEFAULT_CHANNEL) {
        return {
            id: 'mobile.create_post.read_only.enterprise',
            defaultMessage: 'This enterprise main channel is read-only.',
        };
    }
    if (channelType === General.DM_CHANNEL) {
        return {
            id: 'mobile.create_post.read_only.dm',
            defaultMessage: 'This direct message is read-only.',
        };
    }
    if (channelType === General.GM_CHANNEL) {
        return {
            id: 'mobile.create_post.read_only.discussion',
            defaultMessage: 'This group chat is read-only.',
        };
    }
    return {
        id: 'mobile.create_post.read_only',
        defaultMessage: 'This channel is read-only.',
    };
}

const edges: Edge[] = ['bottom'];

/**
 * 只读频道组件，根据频道类型显示不同的只读提示
 * @param props - 组件属性
 * @returns 只读提示组件
 */
const ReadOnlyChannnel = ({testID, channelType, channelName}: ReadOnlyProps) => {
    const theme = useTheme();
    const style = getStyle(theme);
    const messageKey = getReadOnlyMessageKey(channelType, channelName);

    return (
        <View style={style.wrapper}>
            <SafeAreaView
                edges={edges}
                style={style.background}
            >
                <View
                    testID={testID}
                    style={style.container}
                >
                    <CompassIcon
                        name='glasses'
                        style={style.icon}
                        color={theme.centerChannelColor}
                    />
                    <FormattedText
                        id={messageKey.id}
                        defaultMessage={messageKey.defaultMessage}
                        style={style.text}
                    />
                </View>
            </SafeAreaView>
        </View>
    );
};

export default ReadOnlyChannnel;
