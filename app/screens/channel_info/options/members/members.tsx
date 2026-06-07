// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Platform} from 'react-native';

import OptionItem from '@components/option_item';
import {General, Screens} from '@constants';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {goToScreen} from '@screens/navigation';
import {changeOpacity} from '@utils/theme';

type MembersProps = {
    channelId: string;
    displayName: string;
    count: number;
    channelType?: ChannelType;
    isTeamDefaultOpenChannel?: boolean;
}

/**
 * Members 组件 - 显示成员入口，根据频道类型决定副标题文案
 * @param props - 组件属性
 */
const Members = ({displayName, channelId, count, channelType, isTeamDefaultOpenChannel = false}: MembersProps) => {
    const {formatMessage} = useIntl();
    const theme = useTheme();
    const title = formatMessage({id: 'channel_info.members', defaultMessage: 'Members'});

    /**
     * 获取副标题文案
     * 企业总群显示"企业总群"，其他显示频道 displayName
     */
    const getSubtitle = useCallback(() => {
        // 从 index.ts 传入的特殊标记，表示企业总群
        if (displayName === 'enterprise_main_channel') {
            return formatMessage({id: 'channel_list.town_square.display_name', defaultMessage: 'Enterprise Main Channel'});
        }
        return displayName;
    }, [displayName, formatMessage]);

    const goToChannelMembers = usePreventDoubleTap(useCallback(() => {
        const subtitleText = getSubtitle();
        const options = {
            topBar: {
                subtitle: {
                    color: changeOpacity(theme.sidebarHeaderTextColor, 0.72),
                    text: subtitleText,
                },
            },
        };

        goToScreen(Screens.MANAGE_CHANNEL_MEMBERS, title, {channelId}, options);
    }, [channelId, theme.sidebarHeaderTextColor, title, getSubtitle]));

    return (
        <OptionItem
            action={goToChannelMembers}
            label={title}
            icon='account-multiple-outline'
            type={Platform.select({ios: 'arrow', default: 'default'})}
            info={count.toString()}
            testID='channel_info.options.members.option'
        />
    );
};

export default Members;
