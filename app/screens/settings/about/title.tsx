// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Text, View} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        name: {
            ...typography('Heading', 600, 'SemiBold'),
            color: theme.centerChannelColor,
            textAlign: 'center',
            marginBottom: 8,
        },
        edition: {
            ...typography('Body', 100, 'SemiBold'),
            color: theme.centerChannelColor,
            textAlign: 'center',
        },
    };
});

const messages = defineMessages({
    editionStandard: {
        id: 'about.edition.standard',
        defaultMessage: 'Standard',
    },
    editionEnterprise: {
        id: 'about.edition.enterprise',
        defaultMessage: 'Enterprise',
    },
});

type TitleProps = {
    config: ClientConfig;
};

const Title = ({config}: TitleProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const style = getStyleSheet(theme);

    const editionMessage =
        config.BuildEnterpriseReady === 'true' ? messages.editionEnterprise : messages.editionStandard;

    const appName = intl.formatMessage({id: 'mobile.app.display_name', defaultMessage: 'Dedalix'}) || config.SiteName;

    return (
        <View>
            <Text
                style={style.name}
                testID='about.site_name'
            >
                {appName}
            </Text>
            <FormattedText
                {...editionMessage}
                style={style.edition}
                testID='about.title'
            />
        </View>
    );
};

export default Title;
