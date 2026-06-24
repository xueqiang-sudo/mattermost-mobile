// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {of as of$} from 'rxjs';
import {switchMap} from 'rxjs/operators';

import CompassIcon from '@components/compass_icon';
import OptionBox from '@components/option_box';
import SlideUpPanelItem from '@components/slide_up_panel_item';
import {General, Screens} from '@constants';
import {useTheme} from '@context/theme';
import {observeChannel} from '@queries/servers/channel';
import {observeCurrentTeam} from '@queries/servers/team';
import {dismissBottomSheet, showModal} from '@screens/navigation';
import {isDefaultChannel, usesDiscussionGroupChannelCopy} from '@utils/channel';

import type {WithDatabaseArgs} from '@typings/database/database';
import type {StyleProp, ViewStyle} from 'react-native';

type Props = {
    channelId: string;
    containerStyle?: StyleProp<ViewStyle>;
    showAsLabel?: boolean;
    testID?: string;
}

type InnerProps = Props & {
    channelType?: ChannelType;
    isTeamDefaultOpenChannel?: boolean;
    teamDisplayName?: string;
}

const InfoBoxBody = ({channelId, channelType, containerStyle, isTeamDefaultOpenChannel = false, showAsLabel = false, teamDisplayName, testID}: InnerProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const discussionUx = usesDiscussionGroupChannelCopy(channelType);

    const onViewInfo = useCallback(async () => {
        await dismissBottomSheet();
        // 导航栏标题优先使用企业名称
        const title = teamDisplayName ||
            intl.formatMessage({id: 'screens.channel_info', defaultMessage: 'Channel info'});
        const closeButton = CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor);
        const closeButtonId = 'close-channel-info';

        const options = {
            topBar: {
                leftButtons: [{
                    id: closeButtonId,
                    icon: closeButton,
                    testID: 'close.channel_info.button',
                }],
            },
        };
        showModal(Screens.CHANNEL_INFO, title, {channelId, closeButtonId}, options);
    }, [channelId, intl, teamDisplayName, theme]);

    const slideUpLabel = discussionUx
        ? intl.formatMessage({id: 'screens.channel_info.gm', defaultMessage: 'Discussion group info'})
        : channelType === General.DM_CHANNEL
            ? intl.formatMessage({id: 'screens.channel_info.dm', defaultMessage: 'Direct message info'})
            : channelType === General.OPEN_CHANNEL && isTeamDefaultOpenChannel
                ? intl.formatMessage({id: 'screens.channel_info.enterprise_main', defaultMessage: 'Enterprise main group info'})
                : channelType === General.PRIVATE_CHANNEL
                    ? intl.formatMessage({id: 'screens.channel_info.private_group_chat', defaultMessage: 'Group chat info'})
                    : channelType === General.OPEN_CHANNEL && isTeamDefaultOpenChannel
                        ? intl.formatMessage({id: 'screens.channel_info.enterprise_main', defaultMessage: 'Enterprise main group info'})
                        : channelType === General.OPEN_CHANNEL
                            ? intl.formatMessage({id: 'screens.channel_info.public_group_chat', defaultMessage: 'Public group chat info'})
                            : intl.formatMessage({id: 'channel_header.info', defaultMessage: 'View info'});

    if (showAsLabel) {
        return (
            <SlideUpPanelItem
                leftIcon='information-outline'
                onPress={onViewInfo}
                testID={testID}
                text={slideUpLabel}
            />
        );
    }

    return (
        <OptionBox
            containerStyle={containerStyle}
            iconName='information-outline'
            onPress={onViewInfo}
            testID={testID}
            text={intl.formatMessage({id: 'intro.channel_info', defaultMessage: 'Info'})}
        />
    );
};

type OwnProps = WithDatabaseArgs & Props;

const enhanced = withObservables(['channelId'], ({channelId, database}: OwnProps) => {
    const channel = observeChannel(database, channelId);
    const channelType = channel.pipe(
        switchMap((c) => of$(c?.type as ChannelType | undefined)),
    );
    const isTeamDefaultOpenChannel = channel.pipe(
        switchMap((c) => of$(Boolean(c?.type === General.OPEN_CHANNEL && isDefaultChannel(c)))),
    );
    const teamDisplayName = observeCurrentTeam(database).pipe(
        switchMap((t) => of$(t?.displayName || '')),
    );
    return {channelType, isTeamDefaultOpenChannel, teamDisplayName};
});

export default withDatabase(enhanced(InfoBoxBody));
