// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useIsFocused} from '@react-navigation/native';
import React, {useCallback, useMemo} from 'react';
import {Freeze} from 'react-freeze';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';
import {type Edge, SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';

import {logout} from '@actions/remote/session';
import QrcodeSvg from '@assets/images/svgs/qrcode.svg';
import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {Screens} from '@constants';
import {useServerDisplayName, useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {alertServerLogout} from '@utils/server';
import {goToScreen, showModal, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {formatFullName} from '@utils/display_name';
import {useUserLocale} from '@context/user_locale';

import type UserModel from '@typings/database/models/servers/user';

const edges: Edge[] = ['bottom', 'left', 'right'];

type Props = {
    currentUser?: UserModel;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {
        flex: 1,
    },
    navBar: {
        height: 48,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.sidebarBg,
    },
    navTitle: {
        color: theme.sidebarHeaderTextColor,
        ...typography('Heading', 200, 'SemiBold'),
    },
    scrollContent: {
        flexGrow: 1,
    },
    profileSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 20,
    },
    profileInfo: {
        flex: 1,
        marginLeft: 14,
        minWidth: 0,
    },
    nickname: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    externalCardIconCircle: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 20,
    },
    section: {
        marginTop: 12,
        marginHorizontal: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        overflow: 'hidden',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    menuIcon: {
        marginRight: 14,
    },
    menuLabel: {
        flex: 1,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    menuChevron: {
        color: changeOpacity(theme.centerChannelColor, 0.32),
    },
    divider: {
        height: 0.5,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        marginLeft: 56,
    },
    logoutLabel: {
        color: theme.dndIndicator,
    },
}));

const MeScreen = ({currentUser}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const serverDisplayName = useServerDisplayName();
    const locale = useUserLocale();
    const insets = useSafeAreaInsets();
    const isFocused = useIsFocused();
    const styles = getStyleSheet(theme);

    const fullName = useMemo(() => {
        if (!currentUser) {
            return '';
        }
        return formatFullName(locale, currentUser.lastName ?? '', currentUser.firstName ?? '');
    }, [currentUser, locale]);

    const displayName = useMemo(() => {
        if (!currentUser) {
            return '';
        }
        const nick = currentUser.nickname?.trim();
        return nick || fullName || currentUser.username || '';
    }, [currentUser, fullName]);

    const openEditProfile = usePreventDoubleTap(useCallback(() => {
        showModal(
            Screens.EDIT_PROFILE,
            intl.formatMessage({id: 'me.my_profile', defaultMessage: 'My Profile'}),
        );
    }, [intl]));

    const openExternalCard = usePreventDoubleTap(useCallback(() => {
        showModalWithBackButton(
            Screens.EXTERNAL_PROFILE_CARD,
            intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'}),
            'close-me-external-profile',
        );
    }, [intl]));

    const openSettings = usePreventDoubleTap(useCallback(() => {
        showModal(
            Screens.SETTINGS,
            intl.formatMessage({id: 'mobile.screen.settings', defaultMessage: 'Settings'}),
        );
    }, [intl]));

    const openMyEnterprise = usePreventDoubleTap(useCallback(() => {
        const title = intl.formatMessage({id: 'me.my_enterprise', defaultMessage: 'My Enterprise'});
        goToScreen(Screens.MANAGE_ENTERPRISE, title);
    }, [intl]));

    const openAbout = usePreventDoubleTap(useCallback(() => {
        const title = intl.formatMessage({id: 'settings.about', defaultMessage: 'About'});
        goToScreen(Screens.ABOUT, title);
    }, [intl]));

    const handleLogout = usePreventDoubleTap(useCallback(() => {
        alertServerLogout(serverDisplayName, () => logout(serverUrl, intl), intl);
    }, [intl, serverDisplayName, serverUrl]));

    return (
        <Freeze freeze={!isFocused}>
            <SafeAreaView
                edges={edges}
                style={[styles.flex, {backgroundColor: theme.sidebarBg}]}
                testID='me.screen'
            >
                {/* 导航栏：延伸到状态栏区域，标题"我"居中显示，支持三语 */}
                <View style={[styles.navBar, {paddingTop: insets.top, backgroundColor: theme.sidebarBg}]}>
                    <Text style={styles.navTitle}>
                        {intl.formatMessage({id: 'tab_bar.me.label', defaultMessage: 'Me'})}
                    </Text>
                </View>
                <ScrollView
                    style={styles.flex}
                    contentContainerStyle={styles.scrollContent}
                    showsVerticalScrollIndicator={false}
                >
                    <View style={[styles.profileSection, {backgroundColor: theme.centerChannelBg}]}>
                        {currentUser && (
                            <ProfilePicture
                                author={currentUser}
                                size={32}
                                showStatus={false}
                                borderRadius={4}
                            />
                        )}
                        <View style={styles.profileInfo}>
                            <Text
                                numberOfLines={1}
                                style={styles.nickname}
                                testID='me.nickname'
                            >
                                {displayName}
                            </Text>
                        </View>
                        <TouchableOpacity
                            onPress={openExternalCard}
                            activeOpacity={0.7}
                            testID='me.external_card'
                        >
                            <View style={styles.externalCardIconCircle}>
                                <QrcodeSvg
                                    width={22}
                                    height={22}
                                    color={theme.centerChannelColor}
                                />
                            </View>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.section}>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={openEditProfile}
                            activeOpacity={0.7}
                            testID='me.edit_profile'
                        >
                            <CompassIcon
                                name='account-outline'
                                size={24}
                                color={theme.centerChannelColor}
                                style={styles.menuIcon}
                            />
                            <Text style={styles.menuLabel}>
                                {intl.formatMessage({id: 'me.my_profile', defaultMessage: 'My Profile'})}
                            </Text>
                            <CompassIcon
                                name='chevron-right'
                                size={20}
                                style={styles.menuChevron}
                            />
                        </TouchableOpacity>
                        <View style={styles.divider}/>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={openSettings}
                            activeOpacity={0.7}
                            testID='me.settings'
                        >
                            <CompassIcon
                                name='settings-outline'
                                size={24}
                                color={theme.centerChannelColor}
                                style={styles.menuIcon}
                            />
                            <Text style={styles.menuLabel}>
                                {intl.formatMessage({id: 'account.settings', defaultMessage: 'Settings'})}
                            </Text>
                            <CompassIcon
                                name='chevron-right'
                                size={20}
                                style={styles.menuChevron}
                            />
                        </TouchableOpacity>
                        <View style={styles.divider}/>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={openMyEnterprise}
                            activeOpacity={0.7}
                            testID='me.my_enterprise'
                        >
                            <CompassIcon
                                name='sitemap'
                                size={24}
                                color={theme.centerChannelColor}
                                style={styles.menuIcon}
                            />
                            <Text style={styles.menuLabel}>
                                {intl.formatMessage({id: 'me.my_enterprise', defaultMessage: 'My Enterprise'})}
                            </Text>
                            <CompassIcon
                                name='chevron-right'
                                size={20}
                                style={styles.menuChevron}
                            />
                        </TouchableOpacity>
                        <View style={styles.divider}/>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={openAbout}
                            activeOpacity={0.7}
                            testID='me.about'
                        >
                            <CompassIcon
                                name='information-outline'
                                size={24}
                                color={theme.centerChannelColor}
                                style={styles.menuIcon}
                            />
                            <Text style={styles.menuLabel}>
                                {intl.formatMessage({id: 'settings.about', defaultMessage: 'About'})}
                            </Text>
                            <CompassIcon
                                name='chevron-right'
                                size={20}
                                style={styles.menuChevron}
                            />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.section}>
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={handleLogout}
                            activeOpacity={0.7}
                            testID='me.logout'
                        >
                            <CompassIcon
                                name='exit-to-app'
                                size={24}
                                color={theme.dndIndicator}
                                style={styles.menuIcon}
                            />
                            <Text style={[styles.menuLabel, styles.logoutLabel]}>
                                {intl.formatMessage({id: 'account.logout', defaultMessage: 'Log out'})}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </Freeze>
    );
};

export default MeScreen;
