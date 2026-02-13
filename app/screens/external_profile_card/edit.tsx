// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Text, TouchableOpacity, View} from 'react-native';

import OptionItem from '@components/option_item';
import ProfilePicture from '@components/profile_picture';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {observeCurrentUser, observeTeammateNameDisplay} from '@queries/servers/user';
import {dismissModal, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername, getFullName} from '@utils/user';

import type {AvailableScreens} from '@typings/screens/navigation';
import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';

const CARD_BG_LIGHT_GRAY = '#B0B0B0';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    card: {
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
    optionsWrapper: {
        marginBottom: 24,
    },
    footer: {
        flexDirection: 'row',
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.12),
        minHeight: 52,
    },
    footerButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    footerDivider: {
        width: 1,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.12),
    },
    footerCancelText: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
    footerConfirmText: {
        color: theme.buttonBg,
        ...typography('Body', 100, 'SemiBold'),
    },
}));

type ExternalProfileCardEditProps = {
    componentId: AvailableScreens;
    closeButtonId: string;
    currentUser?: UserModel;
    teammateNameDisplay: string;
};

const ExternalProfileCardEditScreen = ({
    componentId,
    closeButtonId,
    currentUser,
    teammateNameDisplay,
}: ExternalProfileCardEditProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const primaryName = currentUser
        ? displayUsername(currentUser, currentUser.locale, teammateNameDisplay, false) || getFullName(currentUser) || currentUser.username
        : '';
    const secondaryName = currentUser?.nickname || (currentUser ? `@${currentUser.username}` : '');

    const onClosePressed = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    const onCancel = usePreventDoubleTap(useCallback(() => {
        dismissModal({componentId});
    }, [componentId]));

    const onConfirm = usePreventDoubleTap(useCallback(() => {
        dismissModal({componentId});
    }, [componentId]));

    const onStylePress = usePreventDoubleTap(useCallback(() => {
        showModalWithBackButton(
            Screens.EXTERNAL_PROFILE_CARD_STYLE,
            intl.formatMessage({id: 'external_profile_card.style', defaultMessage: 'Style'}),
            'close-external-profile-card-style',
        );
    }, [intl]));

    const onExternalInfoPress = usePreventDoubleTap(useCallback(() => {
        showModalWithBackButton(
            Screens.EXTERNAL_PROFILE_CARD_EXTERNAL_INFO,
            intl.formatMessage({id: 'external_profile_card.external_info_display', defaultMessage: 'External Information Display'}),
            'close-external-profile-card-external-info',
        );
    }, [intl]));

    if (!currentUser) {
        return null;
    }

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <View style={styles.card}>
                    <View style={styles.avatarWrapper}>
                        <ProfilePicture
                            author={currentUser}
                            size={72}
                            iconSize={32}
                            showStatus={false}
                        />
                    </View>
                    <Text style={styles.primaryName} numberOfLines={1}>
                        {primaryName || getFullName(currentUser) || currentUser.username}
                    </Text>
                    {(secondaryName || currentUser.nickname) ? (
                        <Text style={styles.secondaryName} numberOfLines={1}>
                            {currentUser.nickname || secondaryName}
                        </Text>
                    ) : null}
                </View>
                <View style={styles.optionsWrapper}>
                    <OptionItem
                        icon="palette-outline"
                        label={intl.formatMessage({id: 'external_profile_card.style', defaultMessage: 'Style'})}
                        testID="external_profile_card_edit.style.option"
                        type="arrow"
                        action={() => { onStylePress(); }}
                    />
                    <OptionItem
                        icon="account-outline"
                        label={intl.formatMessage({id: 'external_profile_card.external_info', defaultMessage: 'External Info'})}
                        info={intl.formatMessage({id: 'external_profile_card.real_name', defaultMessage: 'Real Name'})}
                        testID="external_profile_card_edit.external_info.option"
                        type="arrow"
                        action={() => { onExternalInfoPress(); }}
                    />
                </View>
            </View>
            <View style={styles.footer}>
                <TouchableOpacity
                    style={styles.footerButton}
                    onPress={onCancel}
                    testID="external_profile_card_edit.cancel"
                >
                    <Text style={styles.footerCancelText}>
                        {intl.formatMessage({id: 'mobile.general.cancel', defaultMessage: 'Cancel'})}
                    </Text>
                </TouchableOpacity>
                <View style={styles.footerDivider}/>
                <TouchableOpacity
                    style={styles.footerButton}
                    onPress={onConfirm}
                    testID="external_profile_card_edit.confirm"
                >
                    <Text style={styles.footerConfirmText}>
                        {intl.formatMessage({id: 'mobile.general.confirm', defaultMessage: 'Confirm'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
    teammateNameDisplay: observeTeammateNameDisplay(database),
}));

export default withDatabase(enhanced(ExternalProfileCardEditScreen));
