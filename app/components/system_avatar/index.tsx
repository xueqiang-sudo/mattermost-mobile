// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {StyleSheet} from 'react-native';

import ExpoImage from '@components/expo_image';
import {View as ViewConstants} from '@constants';

type Props = {
    theme: Theme;
};

const SYSTEM_AVATAR_IMAGE = require('@assets/images/icon.png');

const styles = StyleSheet.create({
    image: {
        borderRadius: ViewConstants.PROFILE_PICTURE_SIZE / 2,
        height: ViewConstants.PROFILE_PICTURE_SIZE,
        width: ViewConstants.PROFILE_PICTURE_SIZE,
    },
});

const SystemAvatar = (_props: Props) => {
    return (
        <ExpoImage
            id='system-avatar'
            cachePolicy='memory'
            source={SYSTEM_AVATAR_IMAGE}
            style={styles.image}
        />
    );
};

export default SystemAvatar;
