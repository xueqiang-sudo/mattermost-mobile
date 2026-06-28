// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {nativeApplicationVersion, nativeBuildVersion} from 'expo-application';
import React from 'react';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        subtitle: {
            color: changeOpacity(theme.centerChannelColor, 0.56),
            ...typography('Body', 200, 'Regular'),
            textAlign: 'center',
            marginTop: 8,
            paddingHorizontal: 16,
        },
    };
});

const Subtitle = () => {
    const theme = useTheme();
    const style = getStyleSheet(theme);

    return (
        <FormattedText
            id='about.version_info'
            defaultMessage='Version {version} (Build {build})'
            style={style.subtitle}
            testID='about.subtitle'
            values={{version: nativeApplicationVersion ?? '—', build: nativeBuildVersion ?? '—'}}
        />
    );
};

export default Subtitle;
