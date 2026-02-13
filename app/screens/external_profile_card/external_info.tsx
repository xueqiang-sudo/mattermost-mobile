// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {withDatabase, withObservables} from '@nozbe/watermelondb/react';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {ScrollView, Switch, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import ProfilePicture from '@components/profile_picture';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {observeCurrentUser, observeTeammateNameDisplay} from '@queries/servers/user';
import {dismissModal, setButtons, showModalWithBackButton} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';
import {displayUsername, getFullName} from '@utils/user';

import type {AvailableScreens} from '@typings/screens/navigation';
import type UserModel from '@typings/database/models/servers/user';
import type {WithDatabaseArgs} from '@typings/database/database';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    content: {
        paddingHorizontal: 20,
        paddingBottom: 24,
    },
    title: {
        color: theme.centerChannelColor,
        ...typography('Heading', 300, 'SemiBold'),
        marginTop: 16,
        marginBottom: 8,
    },
    subtitle: {
        color: changeOpacity(theme.centerChannelColor, 0.72),
        ...typography('Body', 75, 'Regular'),
        marginBottom: 24,
    },
    card: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardRowLast: {
        borderBottomWidth: 0,
    },
    cardRowLabel: {
        color: theme.centerChannelColor,
        ...typography('Body', 100, 'Regular'),
    },
    cardHint: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 75, 'Regular'),
        paddingHorizontal: 16,
        paddingBottom: 12,
        paddingTop: 4,
    },
}));

type ExternalProfileCardExternalInfoProps = {
    componentId: AvailableScreens;
    closeButtonId: string;
    currentUser?: UserModel;
    teammateNameDisplay: string;
};

const ExternalProfileCardExternalInfoScreen = ({
    componentId,
    closeButtonId,
    currentUser,
    teammateNameDisplay,
}: ExternalProfileCardExternalInfoProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const [showPosition, setShowPosition] = useState(false);
    const [showMobile, setShowMobile] = useState(false);
    const [showEmail, setShowEmail] = useState(false);
    const [showAddress, setShowAddress] = useState(false);
    const [showVideoAccount, setShowVideoAccount] = useState(false);

    const primaryName = currentUser
        ? displayUsername(currentUser, currentUser.locale, teammateNameDisplay, false) || getFullName(currentUser) || currentUser.username
        : '';
    const companyAbbr = currentUser?.nickname || primaryName;

    const onClosePressed = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId, componentId, onClosePressed, []);
    useAndroidHardwareBackHandler(componentId, onClosePressed);

    const doneButton = useMemo(() => ({
        id: 'external-info-done',
        text: intl.formatMessage({id: 'external_profile_card.done', defaultMessage: 'Done'}),
        color: theme.sidebarHeaderTextColor,
        testID: 'external_profile_card_external_info.done',
    }), [intl, theme.sidebarHeaderTextColor]);

    useEffect(() => {
        setButtons(componentId, {
            rightButtons: [doneButton],
        });
    }, [componentId, doneButton]);

    useNavButtonPressed(doneButton.id, componentId, onClosePressed, []);

    const onPreviewPress = usePreventDoubleTap(useCallback(() => {
        showModalWithBackButton(
            Screens.EXTERNAL_PROFILE_CARD,
            intl.formatMessage({id: 'external_profile_card.title', defaultMessage: 'External Profile Card'}),
            'close-external-profile-card-preview',
        );
    }, [intl]));

    if (!currentUser) {
        return null;
    }

    const toggleRow = (labelId: string, value: boolean, onValueChange: (v: boolean) => void, testID: string, isLast?: boolean) => (
        <View style={[styles.cardRow, isLast && styles.cardRowLast]}>
            <Text style={styles.cardRowLabel}>
                {intl.formatMessage({id: labelId, defaultMessage: labelId})}
            </Text>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{
                    false: changeOpacity(theme.centerChannelColor, 0.16),
                    true: theme.buttonBg,
                }}
                thumbColor={value ? theme.buttonColor : '#F3F3F3'}
                testID={testID}
            />
        </View>
    );

    return (
        <View style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                <TouchableOpacity onPress={onPreviewPress} style={{alignSelf: 'flex-start', marginBottom: 8}}>
                    <Text style={[styles.cardRowLabel, {color: theme.buttonBg}]}>
                        {intl.formatMessage({id: 'external_profile_card.preview', defaultMessage: 'Preview'})}
                    </Text>
                </TouchableOpacity>
                <Text style={styles.title}>
                    {intl.formatMessage({id: 'external_profile_card.external_info_display', defaultMessage: 'External Information Display'})}
                </Text>
                <Text style={styles.subtitle}>
                    {intl.formatMessage({id: 'external_profile_card.external_info_subtitle', defaultMessage: 'The following information will be displayed to external contacts'})}
                </Text>

                <View style={styles.card}>
                    <TouchableOpacity style={styles.cardRow} activeOpacity={0.7}>
                        <Text style={styles.cardRowLabel}>
                            {intl.formatMessage({id: 'external_profile_card.avatar', defaultMessage: 'Avatar'})}
                        </Text>
                        <ProfilePicture author={currentUser} size={32} iconSize={16} showStatus={false}/>
                        <CompassIcon name="chevron-right" size={24} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    </TouchableOpacity>
                    <View style={[styles.cardRow]}>
                        <Text style={styles.cardRowLabel}>
                            {intl.formatMessage({id: 'external_profile_card.company_abbr', defaultMessage: 'Company Abbreviation'})}
                        </Text>
                        <Text style={[styles.cardRowLabel, {color: changeOpacity(theme.centerChannelColor, 0.72)}]} numberOfLines={1}>
                            {companyAbbr}
                        </Text>
                        <CompassIcon name="chevron-right" size={24} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    </View>
                    <View style={[styles.cardRow]}>
                        <Text style={styles.cardRowLabel}>
                            {intl.formatMessage({id: 'external_profile_card.name_display', defaultMessage: 'Name Display'})}
                        </Text>
                        <Text style={[styles.cardRowLabel, {color: changeOpacity(theme.centerChannelColor, 0.72)}]} numberOfLines={1}>
                            {primaryName || getFullName(currentUser) || currentUser.username}
                        </Text>
                        <CompassIcon name="chevron-right" size={24} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    </View>
                    {toggleRow('external_profile_card.external_position', showPosition, setShowPosition, 'external_info.position_switch', true)}
                </View>

                <View style={styles.card}>
                    {toggleRow('external_profile_card.mobile', showMobile, setShowMobile, 'external_info.mobile_switch', false)}
                    {toggleRow('external_profile_card.email', showEmail, setShowEmail, 'external_info.email_switch', false)}
                    {toggleRow('external_profile_card.address', showAddress, setShowAddress, 'external_info.address_switch', false)}
                    {toggleRow('external_profile_card.video_account', showVideoAccount, setShowVideoAccount, 'external_info.video_switch', true)}
                </View>

                <View style={styles.card}>
                    <View style={[styles.cardRow]}>
                        <Text style={styles.cardRowLabel}>
                            {intl.formatMessage({id: 'external_profile_card.enterprise_card', defaultMessage: 'Enterprise Business Card'})}
                        </Text>
                        <Text style={[styles.cardRowLabel, {color: changeOpacity(theme.centerChannelColor, 0.72)}]} numberOfLines={1}>
                            {companyAbbr}
                        </Text>
                        <CompassIcon name="chevron-right" size={24} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    </View>
                    <Text style={styles.cardHint}>
                        {intl.formatMessage({id: 'external_profile_card.enterprise_card_hint', defaultMessage: 'Improve the enterprise business card to more formally introduce the enterprise and display rich information'})}
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
};

const enhanced = withObservables([], ({database}: WithDatabaseArgs) => ({
    currentUser: observeCurrentUser(database),
    teammateNameDisplay: observeTeammateNameDisplay(database),
}));

export default withDatabase(enhanced(ExternalProfileCardExternalInfoScreen));
