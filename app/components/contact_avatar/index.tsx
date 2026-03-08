// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {ContactEmployee} from '@client/rest/contact';

type Props = {
    employee: ContactEmployee;
    size?: number;
};

const getInitials = (name: string): string | null => {
    const trimmed = name?.trim();
    if (!trimmed) {
        return null;
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
        const first = parts[0].charAt(0);
        const last = parts[parts.length - 1].charAt(0);
        return (first + last).toUpperCase().slice(0, 2);
    }
    return trimmed.charAt(0).toUpperCase();
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
    },
    initials: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    icon: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
    },
}));

const ContactAvatar = ({employee, size = 40}: Props) => {
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const initials = useMemo(() => getInitials(employee.name ?? ''), [employee.name]);

    const containerStyle = useMemo(() => [
        styles.container,
        {width: size, height: size},
    ], [styles.container, size]);

    const textStyle = useMemo(() => [
        styles.initials,
        {fontSize: size * 0.4},
    ], [styles.initials, size]);

    if (initials) {
        return (
            <View
                style={containerStyle}
                testID={`contact_avatar.${employee.id}`}
            >
                <Text
                    style={textStyle}
                    numberOfLines={1}
                >
                    {initials}
                </Text>
            </View>
        );
    }

    return (
        <View
            style={containerStyle}
            testID={`contact_avatar.${employee.id}`}
        >
            <CompassIcon
                name={ACCOUNT_OUTLINE_IMAGE}
                size={size * 0.55}
                style={styles.icon}
            />
        </View>
    );
};

export default ContactAvatar;
