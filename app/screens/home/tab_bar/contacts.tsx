// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {BOTTOM_TAB_ICON_SIZE} from '@constants/view';
import {changeOpacity, WECHAT_HOME_SECONDARY_TEXT_OPACITY} from '@utils/theme';

type Props = {
    isFocused: boolean;
    theme: Theme;
}

const Contacts = ({isFocused, theme}: Props) => {
    return (
        <View testID='contacts-container'>
            <CompassIcon
                name='sitemap'
                size={BOTTOM_TAB_ICON_SIZE}
                color={isFocused ? theme.buttonBg : changeOpacity(theme.centerChannelColor, WECHAT_HOME_SECONDARY_TEXT_OPACITY)}
                testID='contacts-icon'
            />
        </View>
    );
};

export default Contacts;
