// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import {Platform, Text, View} from 'react-native';

import {buildAbsoluteUrl} from '@actions/remote/file';
import {buildProfileImageUrlFromUser} from '@actions/remote/user';
import CompassIcon from '@components/compass_icon';
import {ExpoImageAnimated} from '@components/expo_image';
import {ACCOUNT_OUTLINE_IMAGE} from '@constants/profile';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {getInitialsForAvatar} from '@utils/user';

type Props = {
    employee?: UserProfile | SimpleUserProfile;
    size?: number;
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
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const lastPictureUpdate = useMemo(() => {
        return employee?.last_picture_update || 0;
    }, [employee]);

    const imgSource = useMemo(() => {
        if (!employee) {
            return undefined;
        }
        const pictureUrl = buildProfileImageUrlFromUser(serverUrl, employee);
        return {uri: buildAbsoluteUrl(serverUrl, pictureUrl)};
    }, [employee, serverUrl, lastPictureUpdate]);

    const initials = useMemo(() => employee ? getInitialsForAvatar(employee) : '', [employee]);

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

    if (imgSource) {
        return (
            <ExpoImageAnimated
                id={`user-${employee.id}-${lastPictureUpdate}`}
                source={imgSource}
                style={containerStyle}
            />
        );
    }

    if (initials) {
        return (
            <View
                style={containerStyle}
                testID={`contact_avatar.${employee?.id ?? 'unknown'}`}
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
            testID={`contact_avatar.${employee?.id ?? 'unknown'}`}
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
