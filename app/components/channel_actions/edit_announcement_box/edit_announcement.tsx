// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';

import OptionBox from '@components/option_box';
import {Screens} from '@constants';
import {dismissBottomSheet, goToScreen, showModal} from '@screens/navigation';

import type {StyleProp, ViewStyle} from 'react-native';

type Props = {
    channelId: string;
    containerStyle?: StyleProp<ViewStyle>;
    hasAnnouncement: boolean;
    inModal?: boolean;
    testID?: string;
}

const EditAnnouncementBox = ({channelId, containerStyle, hasAnnouncement, inModal, testID}: Props) => {
    const intl = useIntl();

    const onPress = useCallback(async () => {
        const title = intl.formatMessage({id: 'screens.edit_channel_announcement', defaultMessage: 'Edit announcement'});
        if (inModal) {
            goToScreen(Screens.EDIT_CHANNEL_ANNOUNCEMENT, title, {channelId});
            return;
        }

        await dismissBottomSheet();
        showModal(Screens.EDIT_CHANNEL_ANNOUNCEMENT, title, {channelId});
    }, [intl, channelId, inModal]);

    const text = hasAnnouncement
        ? intl.formatMessage({id: 'channel_info.edit_announcement', defaultMessage: 'Edit announcement'})
        : intl.formatMessage({id: 'channel_info.set_announcement', defaultMessage: 'Set announcement'});

    return (
        <OptionBox
            containerStyle={containerStyle}
            iconName='bullhorn-outline'
            onPress={onPress}
            testID={testID}
            text={text}
        />
    );
};

export default EditAnnouncementBox;
