// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Text} from 'react-native';

import FormattedText from '@components/formatted_text';
import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme) => {
    return {
        title: {
            ...typography('Heading', 800, 'SemiBold'),
            color: theme.centerChannelColor,
            paddingHorizontal: 36,
        },
        spacerTop: {
            marginTop: 8,
        },
        spacerBottom: {
            marginBottom: 8,
        },
    };
});

const messages = defineMessages({

    teamEditiont0: {
        id: 'about.teamEditiont0',
        defaultMessage: 'Team Edition',
    },
    teamEditiont1: {
        id: 'about.teamEditiont1',
        defaultMessage: 'Enterprise Edition',
    },
    enterpriseEditione1: {
        id: 'about.enterpriseEditione1',
        defaultMessage: 'Enterprise Edition',
    },
});

type TitleProps = {
    config: ClientConfig;
    license?: ClientLicense;
}
const Title = ({config, license}: TitleProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const style = getStyleSheet(theme);

    let message = messages.teamEditiont0;

    if (config.BuildEnterpriseReady === 'true') {
        message = messages.teamEditiont1;

        if (license?.IsLicensed === 'true') {
            message = messages.enterpriseEditione1;
        }
    }

    const appName = intl.formatMessage({id: 'mobile.app.display_name', defaultMessage: 'Optibot'}) || config.SiteName;

    return (
        <>
            <Text
                style={[style.title, style.spacerTop]}
                testID='about.site_name'
            >
                {`${appName} `}
            </Text>
            <FormattedText
                {...message}
                style={[style.title, style.spacerBottom]}
                testID='about.title'
            />
        </>

    );
};

export default Title;
