// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Text, View} from 'react-native';

import {General} from '@constants';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type UserModel from '@typings/database/models/servers/user';

const messages = defineMessages({
    userId: {
        id: 'user_profile.picker_detail.user_id',
        defaultMessage: 'User ID',
    },
    email: {
        id: 'user_profile.picker_detail.email',
        defaultMessage: 'Email',
    },
    phone: {
        id: 'user_profile.picker_detail.phone',
        defaultMessage: 'Phone',
    },
    status: {
        id: 'user_profile.picker_detail.status',
        defaultMessage: 'Status',
    },
    position: {
        id: 'channel_info.position',
        defaultMessage: 'Position',
    },
});

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    card: {
        marginTop: 4,
        marginBottom: 8,
        padding: 12,
        borderRadius: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        overflow: 'hidden',
        gap: 12,
    },
    row: {
        gap: 4,
    },
    label: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'SemiBold'),
    },
    value: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
    valueMono: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
        fontVariant: ['tabular-nums'],
    },
}));

type Props = {
    user: UserModel;
};

export function formatPickerProfilePhone(user: UserModel): string | null {
    const p = user.phone?.trim();
    if (!p) {
        return null;
    }
    const c = user.country_code?.trim();
    if (c) {
        return `${c} ${p}`;
    }
    return p;
}

export function getPickerProfileDetailsHeight(user: UserModel): number {
    const ROW = 44;
    const CARD_PADDING = 24;
    const GAP = 12;
    if (user.isBot) {
        return CARD_PADDING + ROW;
    }
    let rows = 1;
    if (user.email?.trim()) {
        rows++;
    }
    if (user.position?.trim()) {
        rows++;
    }
    if (formatPickerProfilePhone(user)) {
        rows++;
    }
    rows++;
    return CARD_PADDING + rows * ROW + (rows - 1) * GAP;
}

export default function PickerProfileDetails({user}: Props) {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const {formatMessage} = useIntl();

    const statusLabel = useMemo(() => {
        if (user.isBot) {
            return null;
        }
        const s = user.status || General.OFFLINE;
        if (s === General.ONLINE) {
            return formatMessage({id: 'user_status.online', defaultMessage: 'Online'});
        }
        if (s === General.AWAY) {
            return formatMessage({id: 'user_status.away', defaultMessage: 'Away'});
        }
        if (s === General.DND) {
            return formatMessage({id: 'user_status.dnd', defaultMessage: 'Do Not Disturb'});
        }
        return formatMessage({id: 'user_status.offline', defaultMessage: 'Offline'});
    }, [formatMessage, user.isBot, user.status]);

    const phone = formatPickerProfilePhone(user);
    const email = user.email?.trim() ?? '';
    const position = user.position?.trim() ?? '';

    return (
        <View
            style={styles.card}
            testID='user_profile.picker_profile_details'
        >
            <View style={styles.row}>
                <Text style={styles.label}>{formatMessage(messages.userId)}</Text>
                <Text
                    style={styles.valueMono}
                    selectable={true}
                    numberOfLines={2}
                >
                    {user.id}
                </Text>
            </View>
            {!user.isBot && Boolean(email) && (
                <View style={styles.row}>
                    <Text style={styles.label}>{formatMessage(messages.email)}</Text>
                    <Text
                        style={styles.value}
                        selectable={true}
                        numberOfLines={2}
                    >
                        {email}
                    </Text>
                </View>
            )}
            {!user.isBot && Boolean(position) && (
                <View style={styles.row}>
                    <Text style={styles.label}>{formatMessage(messages.position)}</Text>
                    <Text
                        style={styles.value}
                        selectable={true}
                        numberOfLines={2}
                    >
                        {position}
                    </Text>
                </View>
            )}
            {!user.isBot && Boolean(phone) && (
                <View style={styles.row}>
                    <Text style={styles.label}>{formatMessage(messages.phone)}</Text>
                    <Text
                        style={styles.value}
                        selectable={true}
                        numberOfLines={2}
                    >
                        {phone}
                    </Text>
                </View>
            )}
            {!user.isBot && statusLabel && (
                <View style={styles.row}>
                    <Text style={styles.label}>{formatMessage(messages.status)}</Text>
                    <Text
                        style={styles.value}
                        numberOfLines={1}
                    >
                        {statusLabel}
                    </Text>
                </View>
            )}
        </View>
    );
}
