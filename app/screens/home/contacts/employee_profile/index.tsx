// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {makeDirectChannel} from '@actions/remote/channel';
import Button from '@components/button';
import ContactAvatar from '@components/contact_avatar';
import {Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import NetworkManager from '@managers/network_manager';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import type {ContactEmployee} from '@client/rest/contact';
import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-contacts-employee-profile';

type Props = {
    componentId: AvailableScreens;
    closeButtonId?: string;
    employee: ContactEmployee;
    departmentName?: string;
    companyName?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    scrollContent: {
        paddingHorizontal: 16,
        paddingBottom: 32,
    },
    avatarSection: {
        alignItems: 'center',
        paddingVertical: 24,
    },
    avatar: {
        marginBottom: 12,
    },
    name: {
        ...typography('Heading', 400),
        color: theme.centerChannelColor,
    },
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
    },
    cardRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
    },
    cardLabel: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        width: 80,
    },
    cardValue: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        flex: 1,
    },
    sendButton: {
        marginTop: 16,
    },
}));

const ContactsEmployeeProfile = ({
    componentId,
    closeButtonId,
    employee,
    departmentName,
    companyName,
}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);
    const [sending, setSending] = useState(false);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useNavButtonPressed(closeButtonId ?? CLOSE_BUTTON_ID, componentId, handleClose, [handleClose]);
    useAndroidHardwareBackHandler(componentId, handleClose);

    const resolveMattermostUserId = useCallback(async (): Promise<string | null> => {
        if (!serverUrl) {
            return null;
        }
        const client = NetworkManager.getClient(serverUrl);
        try {
            if (employee.email) {
                const user = await client.getUserByEmail(employee.email);
                return user?.id ?? null;
            }
            return employee.id;
        } catch {
            return employee.id;
        }
    }, [serverUrl, employee.id, employee.email]);

    const handleSendMessage = usePreventDoubleTap(useCallback(async () => {
        if (!serverUrl || sending) {
            return;
        }
        setSending(true);
        const userId = await resolveMattermostUserId();
        if (!userId) {
            setSending(false);
            Alert.alert(
                '',
                intl.formatMessage({
                    id: 'mobile.direct_message.error',
                    defaultMessage: "We couldn't open a DM with {displayName}.",
                }, {displayName: employee.name}),
            );
            return;
        }
        const result = await makeDirectChannel(serverUrl, userId, employee.name, true);
        setSending(false);
        if (result.error) {
            Alert.alert(
                '',
                intl.formatMessage({
                    id: 'mobile.direct_message.error',
                    defaultMessage: "We couldn't open a DM with {displayName}.",
                }, {displayName: employee.name}),
            );
            return;
        }
        handleClose();
    }, [serverUrl, sending, resolveMattermostUserId, employee.name, intl, handleClose]));

    const canSendMessage = Boolean(employee.email || employee.id);

    return (
        <SafeAreaView
            edges={['bottom']}
            style={styles.flex}
            testID='contacts.employee_profile.screen'
        >
            <ScrollView
                style={styles.flex}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.avatarSection}>
                    <View style={styles.avatar}>
                        <ContactAvatar
                            employee={employee}
                            size={80}
                        />
                    </View>
                    <Text
                        style={styles.name}
                        numberOfLines={1}
                    >
                        {employee.name}
                    </Text>
                </View>

                <View style={styles.card}>
                    {employee.email ? (
                        <View style={styles.cardRow}>
                            <Text style={styles.cardLabel}>
                                {intl.formatMessage({id: 'contacts.email', defaultMessage: 'Email'})}
                            </Text>
                            <Text
                                style={styles.cardValue}
                                numberOfLines={1}
                            >
                                {employee.email}
                            </Text>
                        </View>
                    ) : null}
                    {departmentName ? (
                        <View style={styles.cardRow}>
                            <Text style={styles.cardLabel}>
                                {intl.formatMessage({id: 'contacts.department', defaultMessage: 'Department'})}
                            </Text>
                            <Text
                                style={styles.cardValue}
                                numberOfLines={1}
                            >
                                {departmentName}
                            </Text>
                        </View>
                    ) : null}
                    {companyName ? (
                        <View style={styles.cardRow}>
                            <Text style={styles.cardLabel}>
                                {intl.formatMessage({id: 'contacts.company', defaultMessage: 'Company'})}
                            </Text>
                            <Text
                                style={styles.cardValue}
                                numberOfLines={1}
                            >
                                {companyName}
                            </Text>
                        </View>
                    ) : null}
                </View>

                {canSendMessage && (
                    <Button
                        onPress={handleSendMessage}
                        type='primary'
                        size='lg'
                        disabled={sending}
                        style={styles.sendButton}
                        testID='contacts.employee_profile.send_message'
                    >
                        {intl.formatMessage({id: 'contacts.send_message', defaultMessage: 'Send Message'})}
                    </Button>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

export default ContactsEmployeeProfile;
