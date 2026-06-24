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
import {dismissBottomSheet, showModal} from '@screens/navigation';

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
}

const InfoBoxBody = ({channelId, channelType, containerStyle, showAsLabel = false, testID}: InnerProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const isChannel = channelType === General.OPEN_CHANNEL || channelType === General.PRIVATE_CHANNEL;

    const onViewInfo = useCallback(async () => {
        await dismissBottomSheet();
        const title = isChannel
            ? intl.formatMessage({id: 'screens.channel_info', defaultMessage: 'Channel info'})
            : intl.formatMessage({id: 'screens.group_info', defaultMessage: 'Group info'});
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
    }, [channelId, intl, isChannel, theme]);

    const slideUpLabel = isChannel
        ? intl.formatMessage({id: 'screens.channel_info', defaultMessage: 'Channel info'})
        : intl.formatMessage({id: 'screens.group_info', defaultMessage: 'Group info'});

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
    return {channelType};
});

export default withDatabase(enhanced(InfoBoxBody));
