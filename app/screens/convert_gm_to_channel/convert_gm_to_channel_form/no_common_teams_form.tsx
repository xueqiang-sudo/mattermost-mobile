// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {View, type ViewStyle} from 'react-native';

import Button from '@components/button';
import {useTheme} from '@context/theme';
import {popTopScreen} from '@screens/navigation';
import {preventDoubleTap} from '@utils/tap';

import MessageBox from '../message_box/message_box';

type Props = {
    containerStyles: ViewStyle;
}

const handleOnPress = preventDoubleTap(() => {
    popTopScreen();
});

export const NoCommonTeamForm = ({
    containerStyles,
}: Props) => {
    const theme = useTheme();
    const {formatMessage} = useIntl();

    const header = formatMessage({
        id: 'channel_info.convert_gm_to_channel.warning.no_teams.header',
        defaultMessage: 'Unable to convert to a channel because group members are part of different enterprises',
    });

    const body = formatMessage({
        id: 'channel_info.convert_gm_to_channel.warning.no_teams.body',
        defaultMessage: 'A discussion group cannot be converted to a channel because members are not part of the same enterprise. Add all members to a single enterprise to convert this discussion group to a channel.',
    });

    const buttonText = formatMessage({
        id: 'generic.back',
        defaultMessage: 'Back',
    });

    return (
        <View style={containerStyles}>
            <MessageBox
                header={header}
                body={body}
                type='danger'
            />
            <Button
                onPress={handleOnPress}
                text={buttonText}
                theme={theme}
                size='lg'
            />
        </View>
    );
};
