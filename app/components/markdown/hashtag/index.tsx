// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {type StyleProp, Text, type TextStyle} from 'react-native';

import {dismissAllModalsAndPopToRoot, findChannels} from '@screens/navigation';
import EphemeralStore from '@store/ephemeral_store';

type HashtagProps = {
    hashtag: string;
    linkStyle: StyleProp<TextStyle>;
};

const Hashtag = ({hashtag, linkStyle}: HashtagProps) => {
    const handlePress = async () => {
        await dismissAllModalsAndPopToRoot();
        const theme = EphemeralStore.theme;
        if (theme) {
            void findChannels(`#${hashtag}`, theme);
        }
    };

    return (
        <Text
            onPress={handlePress}
            style={linkStyle}
        >
            {`#${hashtag}`}
        </Text>
    );
};

export default Hashtag;
