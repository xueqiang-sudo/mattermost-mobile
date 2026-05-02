// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {observeCurrentUser, observeTeammateNameDisplay} from '@queries/servers/user';
import {dismissModal, setButtons} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {getFullName, username2Nickname} from '@utils/user';

import type {WithDatabaseArgs} from '@typings/database/database';
import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

const CARD_BG_LIGHT_GRAY = '#B0B0B0';
const CONFIRM_BUTTON_ID = 'external-profile-card-style-confirm';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    previewCard: {
        alignItems: 'center',
        paddingVertical: 28,
        paddingHorizontal: 24,
        backgroundColor: CARD_BG_LIGHT_GRAY,
        borderRadius: 20,
        width: '100%',
        marginTop: 16,
        marginBottom: 24,
    },
    avatarWrapper: {
        marginBottom: 12,
    },
    primaryName: {
        color: '#FFFFFF',
        ...typography('Heading', 400, 'SemiBold'),
        marginBottom: 4,
        textAlign: 'center',
    },
    secondaryName: {
        color: '#FFFFFF',
        ...typography('Body', 100, 'Regular'),
        textAlign: 'center',
        opacity: 0.95,
    },
    sectionTitle: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'SemiBold'),
        marginBottom: 12,
    },
    layoutRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    layoutThumb: {
        width: 72,
        height: 72,
        borderRadius: 8,
        backgroundColor: theme.centerChannelBg,
        borderWidth: 2,
        borderColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    layoutThumbSelected: {
        borderColor: theme.buttonBg,
    },
    imageOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
    },
    imageOptionIcon: {
        marginRight: 12,
    },
}));

type ExternalProfileCardStyleProps = {
    componentId: AvailableScreens;
    closeButtonId: string;
    currentUser?: UserModel;
    teammateNameDisplay: string;
};

const ExternalProfileCardStyleScreen = ({
    componentId,
    closeButtonId,
    currentUser,
    teammateNameDisplay: _teammateNameDisplay,
}: ExternalProfileCardStyleProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [selectedLayoutIndex, setSelectedLayoutIndex] = useState(0);

    const locale = currentUser?.locale || intl.locale;
    const primaryName = currentUser
        ? username2Nickname(currentUser, {locale, useFallbackUsername: false}) || getFullName(currentUser) || currentUser.username
        : '';
    const secondaryName = currentUser ? `@${username2Nickname(currentUser, {locale, includeFullName: false})}` : '';

    const onClosePressed = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    const onConfirmPressed = usePreventDoubleTap(useCallback(() => {
        dismissModal({componentId});
    }, [componentId]));

    useEffect(() => {
        const checkIcon = CompassIcon.getImageSourceSync('check', 24, theme.sidebarHeaderTextColor);
        setButtons(componentId, {
            rightButtons: [{
                id: CONFIRM_BUTTON_ID,
                icon: checkIcon,
                testID: 'external_profile_card_style.confirm.button',
            }],
        });
    }, [componentId, theme.sidebarHeaderTextColor]);

    useNavButtonPressed(CONFIRM_BUTTON_ID, componentId, onConfirmPressed, []);

    if (!currentUser) {
        return null;
    }

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.previewCard}>
                    <View style={styles.avatarWrapper}>
                        <ProfilePicture
                            author={currentUser}
                            size={72}
                            iconSize={32}
                            showStatus={false}
                        />
                    </View>
                    <Text
                        style={styles.primaryName}
                        numberOfLines={1}
                    >
                        {primaryName || getFullName(currentUser) || currentUser.username}
                    </Text>
                    {secondaryName ? (
                        <Text
                            style={styles.secondaryName}
                            numberOfLines={1}
                        >
                            {secondaryName}
                        </Text>
                    ) : null}
                </View>
                <Text style={styles.sectionTitle}>
                    {intl.formatMessage({id: 'external_profile_card.select_layout', defaultMessage: 'Select Layout'})}
                </Text>
                <View style={styles.layoutRow}>
                    {[0, 1, 2].map((index) => (
                        <TouchableOpacity
                            key={index}
                            style={[styles.layoutThumb, index === selectedLayoutIndex && styles.layoutThumbSelected]}
                            onPress={() => setSelectedLayoutIndex(index)}
                            testID={`external_profile_card_style.layout_${index}`}
                        >
                            <CompassIcon
                                name={index === 0 ? 'account-outline' : 'view-grid-outline'}
                                size={28}
                                color={changeOpacity(theme.centerChannelColor, 0.56)}
                            />
                        </TouchableOpacity>
                    ))}
                </View>
                <Text style={styles.sectionTitle}>
                    {intl.formatMessage({id: 'external_profile_card.select_image', defaultMessage: 'Select Image'})}
                </Text>
                <TouchableOpacity
                    style={styles.imageOption}
                    onPress={() => {}}
                    testID='external_profile_card_style.select_image.option'
                >
                    <View style={styles.imageOptionIcon}>
                        <CompassIcon
                            name='image-outline'
                            size={24}
                            color={theme.centerChannelColor}
                        />
                    </View>
                    <Text style={typography('Body', 100, 'Regular')}>
                        {intl.formatMessage({id: 'external_profile_card.from_gallery', defaultMessage: 'From gallery'})}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
    teammateNameDisplay: observeTeammateNameDisplay(database),
}));

export default withDatabase(enhanced(ExternalProfileCardStyleScreen));
