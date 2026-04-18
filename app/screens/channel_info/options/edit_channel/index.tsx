// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Platform} from 'react-native';

import OptionItem from '@components/option_item';
import {General, Screens} from '@constants';
import {usePreventDoubleTap} from '@hooks/utils';
import {goToScreen} from '@screens/navigation';
import {usesDiscussionGroupChannelCopy} from '@utils/channel';

type Props = {
    channelId: string;
    isTeamDefaultOpenChannel?: boolean;
    type?: ChannelType;
}

const EditChannel = ({channelId, isTeamDefaultOpenChannel = false, type}: Props) => {
    const {formatMessage} = useIntl();
    const title = type && usesDiscussionGroupChannelCopy(type)
        ? formatMessage({id: 'screens.channel_edit.discussion', defaultMessage: 'Edit discussion group'})
        : type === General.PRIVATE_CHANNEL || (type === General.OPEN_CHANNEL && isTeamDefaultOpenChannel)
            ? formatMessage({id: 'screens.channel_edit.private_group_chat', defaultMessage: 'Edit group chat'})
            : formatMessage({id: 'screens.channel_edit', defaultMessage: 'Edit Channel'});

    const goToEditChannel = usePreventDoubleTap(useCallback(async () => {
        goToScreen(Screens.CREATE_OR_EDIT_CHANNEL, title, {channelId});
    }, [channelId, title]));

    return (
        <OptionItem
            action={goToEditChannel}
            label={title}
            icon='pencil-outline'
            type={Platform.select({ios: 'arrow', default: 'default'})}
            testID='channel_info.options.edit_channel.option'
        />
    );
};

export default EditChannel;
