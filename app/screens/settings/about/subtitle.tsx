// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {defineMessages} from 'react-intl';

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
            marginTop: 12,
            paddingHorizontal: 16,
        },
    };
});

const messages = defineMessages({
    slogan: {
        id: 'about.slogan',
        defaultMessage: 'All your team communication in one place, searchable and available anywhere.',
    },
});

const Subtitle = () => {
    const theme = useTheme();
    const style = getStyleSheet(theme);

    return (
        <FormattedText
            {...messages.slogan}
            style={style.subtitle}
            testID='about.subtitle'
        />
    );
};

export default Subtitle;
