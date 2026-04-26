// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {LinearGradient, type LinearGradientProps} from 'expo-linear-gradient';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import ProfilePicture from '@components/profile_picture';
import {useUserLocale} from '@context/user_locale';
import {formatFullName} from '@utils/display_name';
import {blendColors, changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';


import type UserModel from '@typings/database/models/servers/user';

type Props = {
    user: UserModel;
    showFullName: boolean;
    theme: Theme;
};

const GRADIENT_TINT = 0.65;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    const statusBg = changeOpacity(theme.sidebarHeaderTextColor, 0.22);
    return {
        container: {
            paddingHorizontal: 20,
            paddingTop: 24,
            paddingBottom: 28,
            alignItems: 'center',
            overflow: 'hidden',
        },
        gradient: {
            ...StyleSheet.absoluteFillObject,
        },
        statusStyle: {
            right: 2,
            bottom: 2,
            borderColor: statusBg,
            backgroundColor: statusBg,
            borderWidth: 2,
        },
        textFullName: {
            color: changeOpacity(theme.sidebarHeaderTextColor, 0.94),
            marginTop: 16,
            textAlign: 'center',
            ...typography('Heading', 600, 'SemiBold'),
        },
        textUserName: {
            color: changeOpacity(theme.sidebarHeaderTextColor, 0.78),
            marginTop: 4,
            textAlign: 'center',
            ...typography('Body', 200),
        },
    };
});

const AccountUserInfo = ({user, showFullName, theme}: Props) => {
    const locale = useUserLocale();
    const styles = getStyleSheet(theme);
    const fullName = formatFullName(locale, user.lastName ?? '', user.firstName ?? '');
    const nickName = user.nickname && fullName ? ` (${user.nickname})` : (user.nickname || '');
    const title = `${fullName}${nickName}`;
    const userName = `@${user.username}`;
    const accountUserInfoTestId = `account.user_info.${user.id}`;

    return (
        <View style={styles.container}>
            <LinearGradient
                {...({
                    colors: [
                        blendColors(theme.centerChannelBg, theme.sidebarHeaderBg || theme.sidebarBg, GRADIENT_TINT, true),
                        theme.centerChannelBg,
                    ],
                    start: {x: 0, y: 0},
                    end: {x: 1, y: 1},
                    style: styles.gradient,
                } as LinearGradientProps)}
            />
            <ProfilePicture
                size={120}
                iconSize={28}
                showStatus={true}
                author={user}
                statusStyle={styles.statusStyle}
                statusSize={24}
                testID={`${accountUserInfoTestId}.profile_picture`}
            />
            {showFullName &&
            <Text
                style={styles.textFullName}
                testID={`${accountUserInfoTestId}.display_name`}
            >
                {title}
            </Text>
            }
            <Text
                style={showFullName ? styles.textUserName : styles.textFullName}
                testID={`${accountUserInfoTestId}.username`}
            >
                {`${userName}`}
            </Text>
        </View>
    );
};

export default AccountUserInfo;
