// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Platform} from 'react-native';

import OptionItem from '@components/option_item';
import {Screens} from '@constants';
import {usePreventDoubleTap} from '@hooks/utils';
import {goToScreen} from '@screens/navigation';

type Props = {
    channelId: string;
}

const InviteMembers = ({channelId}: Props) => {
    const {formatMessage} = useIntl();
    const title = formatMessage({id: 'channel_info.invite_members', defaultMessage: 'Invite members'});

    const goToInviteMembers = usePreventDoubleTap(useCallback(() => {
        goToScreen(Screens.INVITE, title, {channelId});
    }, [channelId, title]));

    return (
        <OptionItem
            action={goToInviteMembers}
            label={title}
            icon='person-add-outline'
            type={Platform.select({ios: 'arrow', default: 'default'})}
            testID='channel_info.options.invite_members.option'
        />
    );
};

export default InviteMembers;
