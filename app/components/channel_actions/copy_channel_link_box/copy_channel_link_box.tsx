// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {type StyleProp, type ViewStyle} from 'react-native';

import AnimatedOptionBox from '@components/option_box/animated';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';

type Props = {
    channelName?: string;
    containerStyle?: StyleProp<ViewStyle>;
    onAnimationEnd?: () => void;
    teamName?: string;
    testID?: string;
}

const CopyChannelLinkBox = ({channelName, containerStyle, onAnimationEnd, teamName, testID}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();

    const onCopyLink = useCallback(() => {
        Clipboard.setString(`${serverUrl}/${teamName}/channels/${channelName}`);
    }, [channelName, teamName, serverUrl]);

    return (
        <AnimatedOptionBox
            animatedBackgroundColor={theme.onlineIndicator}
            animatedColor={theme.buttonColor}
            animatedIconName='check'
            animatedText={intl.formatMessage({id: 'channel_info.copied', defaultMessage: 'Copied'})}
            containerStyle={containerStyle}
            iconName='link-variant'
            onAnimationEnd={onAnimationEnd}
            onPress={onCopyLink}
            testID={testID}
            text={intl.formatMessage({id: 'channel_info.copy_link', defaultMessage: 'Copy Link'})}
        />
    );
};

export default CopyChannelLinkBox;
