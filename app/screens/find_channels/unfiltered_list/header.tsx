// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Text, View} from 'react-native';

import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        paddingVertical: 8,
        paddingTop: 12,
        paddingLeft: 2,
        backgroundColor: theme.centerChannelBg,
    },
    heading: {
        color: changeOpacity(theme.centerChannelColor, 0.64),
        ...typography('Heading', 75, 'SemiBold'),
    },
    headingRecentOnly: {
        textTransform: 'uppercase',
    },
}));

type Props = {
    sectionName: string;
    teamDisplayName?: string;
}

const FindChannelsHeader = ({sectionName, teamDisplayName}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const team = teamDisplayName?.trim();
    const showTeam = Boolean(team);

    const title = showTeam ?
        intl.formatMessage(
            {
                id: 'find_channels.recent_with_current_org',
                defaultMessage: 'Recent (Current organization: {teamName})',
            },
            {teamName: team},
        ) :
        sectionName.toUpperCase();

    return (
        <View style={styles.container}>
            <Text
                ellipsizeMode='tail'
                numberOfLines={1}
                style={[styles.heading, !showTeam && styles.headingRecentOnly]}
                testID={showTeam ? 'find_channels.header.recent_with_org' : `find_channels.header.${sectionName}`}
            >
                {title}
            </Text>
        </View>
    );
};

export default FindChannelsHeader;
