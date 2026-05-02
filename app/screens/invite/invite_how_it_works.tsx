// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useTheme} from '@context/theme';
import {makeStyleSheetFromTheme, changeOpacity} from '@utils/theme';
import {typography} from '@utils/typography';

const CARD_RADIUS = 12;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    card: {
        marginBottom: 16,
        padding: 16,
        borderRadius: CARD_RADIUS,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.1),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    iconWrap: {
        marginRight: 12,
        marginTop: 2,
    },
    textColumn: {
        flex: 1,
        minWidth: 0,
    },
    title: {
        color: theme.centerChannelColor,
        marginBottom: 8,
        ...typography('Body', 100, 'SemiBold'),
    },
    body: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
        lineHeight: 20,
    },
}));

type InviteHowItWorksProps = {
    emailInvitationsEnabled: boolean;
};

export default function InviteHowItWorks({emailInvitationsEnabled}: InviteHowItWorksProps) {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const bodyText = useMemo(() => {
        const members = intl.formatMessage({
            id: 'invite.howItWorks.body_members',
            defaultMessage: 'Anyone you select who already has an account on this server is added to the enterprise as soon as you tap Send—there is no separate in-app approval step.',
        });
        if (!emailInvitationsEnabled) {
            return members;
        }
        const email = intl.formatMessage({
            id: 'invite.howItWorks.body_email',
            defaultMessage: ' If you enter an email address, that person receives an invitation link by email.',
        });
        return `${members}${email}`;
    }, [emailInvitationsEnabled, intl]);

    return (
        <View
            style={styles.card}
            testID='invite.how_it_works'
        >
            <View style={styles.iconWrap}>
                <CompassIcon
                    name='information-outline'
                    size={22}
                    color={changeOpacity(theme.centerChannelColor, 0.56)}
                />
            </View>
            <View style={styles.textColumn}>
                <Text style={styles.title}>
                    {intl.formatMessage({
                        id: 'invite.howItWorks.title',
                        defaultMessage: 'How invitations work',
                    })}
                </Text>
                <Text style={styles.body}>
                    {bodyText}
                </Text>
            </View>
        </View>
    );
}
