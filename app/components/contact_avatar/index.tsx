// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Platform, Text, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useTheme} from '@context/theme';
import {getContactListDisplayName} from '@utils/contact_section';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    employee: UserProfile;
    size?: number;
};

const LEADING_NON_WORD_RE = /^[^0-9A-Za-z\u3400-\u9FFF\uF900-\uFAFF]+/u;

const getMeaningfulLeadingChar = (value: string): string => {
    const normalized = value.trim().replace(LEADING_NON_WORD_RE, '');
    return normalized.charAt(0);
};

const getInitials = (name: string): string | null => {
    const trimmed = name?.trim();
    if (!trimmed) {
        return null;
    }
    const firstChar = getMeaningfulLeadingChar(trimmed);
    if (!firstChar) {
        return null;
    }
    return firstChar.toUpperCase();
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

    const displayName = useMemo(() => getContactListDisplayName(employee), [employee]);
    const initials = useMemo(() => getInitials(displayName), [displayName]);

    const containerStyle = useMemo(() => [
        styles.container,
        {width: size, height: size},
    ], [styles.container, size]);

    const textStyle = useMemo(() => [
        styles.initials,
        {
            fontSize: size * 0.4,
            lineHeight: size * 0.48,
            ...(Platform.OS === 'android' && {includeFontPadding: false}),
        },
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
