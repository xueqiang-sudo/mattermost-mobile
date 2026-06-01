// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {defineMessages, useIntl} from 'react-intl';
import {Platform, View} from 'react-native';
import {Notifications as RNNotifications} from 'react-native-notifications';
import Permissions, {checkNotifications} from 'react-native-permissions';

import {updateMe} from '@actions/remote/user';
import {getCallsConfig} from '@calls/state';
import OptionItem from '@components/option_item';
import SettingContainer from '@components/settings/container';
import SettingItem from '@components/settings/item';
import {General, Screens} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {useAppState} from '@hooks/device';
import {usePreventDoubleTap} from '@hooks/utils';
import JPushManager from '@init/jpush';
import {popTopScreen} from '@screens/navigation';
import {gotoSettingsScreen} from '@screens/settings/config';
import {logError} from '@utils/log';
import {
    getMessageNotificationEnabled,
    openAppNotificationSettings,
    openMessageNotificationChannelSettings,
    setMessageNotificationEnabled,
} from '@utils/notification/message_notification_pref';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {getEmailInterval, getEmailIntervalTexts, getNotificationProps} from '@utils/user';

import NotificationsDisabledNotice from './notifications_disabled_notice';
import SendTestNotificationNotice from './send_test_notification_notice';

import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

const CARD_RADIUS = 12;
const CARD_PADDING = 16;

/** 暂隐藏：提及/推送/邮件子项与排查通知卡片，待产品就绪后改为 false */
const HIDE_ADVANCED_NOTIFICATION_SETTINGS = true;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    const borderSubtle = changeOpacity(theme.centerChannelColor, 0.08);

    return {
        card: {
            borderRadius: CARD_RADIUS,
            borderWidth: 1,
            borderColor: borderSubtle,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
            paddingHorizontal: CARD_PADDING,
            paddingVertical: 4,
            overflow: 'hidden',
        },
        cardDivider: {
            height: 1,
            backgroundColor: borderSubtle,
            marginHorizontal: -CARD_PADDING,
        },
    };
});

const mentionTexts = defineMessages({
    crtOn: {
        id: 'notification_settings.mentions',
        defaultMessage: 'Mentions',
    },
    crtOff: {
        id: 'notification_settings.mentions_replies',
        defaultMessage: 'Mentions and Replies',
    },
    callsOn: {
        id: 'notification_settings.calls_on',
        defaultMessage: 'On',
    },
    callsOff: {
        id: 'notification_settings.calls_off',
        defaultMessage: 'Off',
    },
});

export type NotificationsProps = {
    componentId: AvailableScreens;
    currentUser?: UserModel;
    emailInterval: string;
    enableAutoResponder: boolean;
    enableEmailBatching: boolean;
    isCRTEnabled: boolean;
    sendEmailNotifications: boolean;
    serverVersion: string;
};

const Notifications = ({
    componentId,
    currentUser,
    emailInterval,
    enableAutoResponder,
    enableEmailBatching,
    isCRTEnabled,
    sendEmailNotifications,
    serverVersion,
}: NotificationsProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const serverUrl = useServerUrl();
    const notifyProps = useMemo(() => getNotificationProps(currentUser), [currentUser]);
    const callsRingingEnabled = useMemo(() => getCallsConfig(serverUrl).EnableRinging, [serverUrl]);
    const [isRegistered, setIsRegistered] = useState(true);
    const [messageNotifEnabled, setMessageNotifEnabled] = useState(true);
    const [mentionOnlyEnabled, setMentionOnlyEnabled] = useState(false);

    const appState = useAppState();

    useEffect(() => {
        setMentionOnlyEnabled(notifyProps?.push === 'mention');
    }, [notifyProps?.push]);

    useEffect(() => {
        const loadPreferences = async () => {
            try {
                const localEnabled = await getMessageNotificationEnabled();
                const pushPref = notifyProps?.push;
                if (pushPref) {
                    const serverEnabled = pushPref !== 'none';
                    setMessageNotifEnabled(serverEnabled);
                    if (serverEnabled !== localEnabled) {
                        await setMessageNotificationEnabled(serverEnabled);
                    }
                } else {
                    setMessageNotifEnabled(localEnabled);
                }
            } catch (error) {
                logError('[Notifications.loadPreferences]', error);
            }
        };
        loadPreferences();
    }, [notifyProps?.push]);

    useEffect(() => {
        let isCurrent = true;
        if (appState === 'active') {
            const checkNotificationStatus = async () => {
                try {
                    const registered = await RNNotifications.isRegisteredForRemoteNotifications();
                    if (isCurrent) {
                        setIsRegistered(registered);
                        await checkNotifications();
                    }
                } catch (error) {
                    if (isCurrent) {
                        logError('[Notifications.checkNotificationStatus]', error);
                    }
                }
            };
            checkNotificationStatus();
        }
        return () => {
            isCurrent = false;
        };
    }, [appState]);

    const emailIntervalPref = useMemo(() =>
        getEmailInterval(
            sendEmailNotifications && notifyProps?.email === 'true',
            enableEmailBatching,
            parseInt(emailInterval, 10),
        ).toString(),
    [emailInterval, enableEmailBatching, notifyProps, sendEmailNotifications]);

    const goToNotificationSettingsMentions = useCallback(() => {
        const screen = Screens.SETTINGS_NOTIFICATION_MENTION;

        const message = isCRTEnabled ? mentionTexts.crtOn : mentionTexts.crtOff;
        const title = intl.formatMessage(message);
        gotoSettingsScreen(screen, title);
    }, [intl, isCRTEnabled]);

    const goToNotificationSettingsPush = useCallback(() => {
        const screen = Screens.SETTINGS_NOTIFICATION_PUSH;
        const title = intl.formatMessage({
            id: 'notification_settings.push_notification',
            defaultMessage: 'Push Notifications',
        });

        gotoSettingsScreen(screen, title);
    }, [intl]);

    const callsNotificationsOn = useMemo(() => Boolean(notifyProps?.calls_mobile_sound ? notifyProps.calls_mobile_sound === 'true' : notifyProps?.calls_desktop_sound === 'true'),
        [notifyProps]);
    const goToNotificationSettingsCall = useCallback(() => {
        const screen = Screens.SETTINGS_NOTIFICATION_CALL;
        const title = intl.formatMessage({
            id: 'notification_settings.call_notification',
            defaultMessage: 'Call Notifications',
        });

        gotoSettingsScreen(screen, title);
    }, [intl]);

    const goToNotificationAutoResponder = useCallback(() => {
        const screen = Screens.SETTINGS_NOTIFICATION_AUTO_RESPONDER;
        const title = intl.formatMessage({
            id: 'notification_settings.auto_responder',
            defaultMessage: 'Automatic Replies',
        });
        gotoSettingsScreen(screen, title);
    }, [intl]);

    const goToEmailSettings = useCallback(() => {
        const screen = Screens.SETTINGS_NOTIFICATION_EMAIL;
        const title = intl.formatMessage({id: 'notification_settings.email', defaultMessage: 'Email Notifications'});
        gotoSettingsScreen(screen, title);
    }, [intl]);

    const openChannelNotificationSettings = usePreventDoubleTap(useCallback(async () => {
        if (Platform.OS === 'android') {
            try {
                const opened = await openMessageNotificationChannelSettings();
                if (opened) {
                    return;
                }
                const openedAppSettings = await openAppNotificationSettings();
                if (openedAppSettings) {
                    return;
                }
            } catch (error) {
                logError('[Notifications.openChannelNotificationSettings]', error);
            }
        }
        Permissions.openSettings('notifications');
    }, []));

    const syncPushPreference = useCallback(async (push: UserNotifyPropsPush) => {
        const result = await updateMe(serverUrl, {
            notify_props: {
                ...notifyProps,
                push,
            },
        });
        if (result.error) {
            throw result.error;
        }
    }, [notifyProps, serverUrl]);

    const syncJPushForCurrentUser = useCallback((push: UserNotifyPropsPush) => {
        const userId = currentUser?.id;
        if (userId) {
            JPushManager.syncForNotifyPush(push, userId);
        }
    }, [currentUser?.id]);

    const handleMessageNotificationToggle = useCallback(async (enabled: boolean) => {
        const nextEnabled = Boolean(enabled);
        try {
            await setMessageNotificationEnabled(nextEnabled);
            setMessageNotifEnabled(nextEnabled);
            const newPush: UserNotifyPropsPush = nextEnabled ? 'all' : 'none';
            if (nextEnabled) {
                setMentionOnlyEnabled(false);
            }
            await syncPushPreference(newPush);
            syncJPushForCurrentUser(newPush);
        } catch (error) {
            logError('[Notifications.handleMessageNotificationToggle]', error);
        }
    }, [syncJPushForCurrentUser, syncPushPreference]);

    const handleMentionOnlyToggle = useCallback(async (enabled: boolean) => {
        if (!messageNotifEnabled) {
            return;
        }
        const nextEnabled = Boolean(enabled);
        const previousEnabled = mentionOnlyEnabled;
        setMentionOnlyEnabled(nextEnabled);
        try {
            const newPush: UserNotifyPropsPush = nextEnabled ? 'mention' : 'all';
            await syncPushPreference(newPush);
        } catch (error) {
            setMentionOnlyEnabled(previousEnabled);
            logError('[Notifications.handleMentionOnlyToggle]', error);
        }
    }, [mentionOnlyEnabled, messageNotifEnabled, syncPushPreference]);

    const close = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, close);

    const messageNotificationLabel = intl.formatMessage({
        id: 'notification_settings.message_notification',
        defaultMessage: 'Message Notifications',
    });

    const mentionOnlyLabel = intl.formatMessage({
        id: 'notification_settings.mention_only',
        defaultMessage: 'Only notify on @mentions',
    });

    const mentionOnlyDescription = intl.formatMessage({
        id: 'notification_settings.mention_only_desc',
        defaultMessage: 'When off, you will receive notifications for all new messages',
    });

    const goToSystemLabel = intl.formatMessage({
        id: 'notification_settings.message_notification.go_to_system',
        defaultMessage: 'Open',
    });

    const systemNotificationTitle = intl.formatMessage({
        id: 'notification_settings.system_notification.title',
        defaultMessage: 'System notification settings',
    });

    const goToSystemDescription = intl.formatMessage({
        id: 'notification_settings.system_notification.desc',
        defaultMessage: 'Manage ringtone, banners, and lock screen alerts in system settings',
    });

    const handleOpenSystemSettings = useCallback(() => {
        openChannelNotificationSettings();
    }, [openChannelNotificationSettings]);

    return (
        <SettingContainer testID='notification_settings'>
            {!isRegistered &&
                <NotificationsDisabledNotice
                    testID='notifications-disabled-notice'
                />}
            <View style={styles.card}>
                <OptionItem
                    action={handleMessageNotificationToggle}
                    icon='bell-outline'
                    label={messageNotificationLabel}
                    selected={messageNotifEnabled}
                    testID='notification_settings.message_notification.toggle'
                    type='toggle'
                />
                {messageNotifEnabled && (
                    <>
                        <View style={styles.cardDivider}/>
                        <OptionItem
                            action={handleMentionOnlyToggle}
                            description={mentionOnlyDescription}
                            descriptionNumberOfLines={2}
                            icon='at'
                            label={mentionOnlyLabel}
                            selected={mentionOnlyEnabled}
                            testID='notification_settings.mention_only.toggle'
                            type='toggle'
                        />
                        <View style={styles.cardDivider}/>
                        <OptionItem
                            action={handleOpenSystemSettings}
                            description={goToSystemDescription}
                            descriptionNumberOfLines={2}
                            icon='settings-outline'
                            info={goToSystemLabel}
                            label={systemNotificationTitle}
                            testID='notification_settings.system_notification.option'
                            type='arrow'
                        />
                    </>
                )}
            </View>
            {!HIDE_ADVANCED_NOTIFICATION_SETTINGS && (
                <>
                    <SettingItem
                        onPress={goToNotificationSettingsMentions}
                        optionName='mentions'
                        label={intl.formatMessage({
                            id: isCRTEnabled ? mentionTexts.crtOn.id : mentionTexts.crtOff.id,
                            defaultMessage: isCRTEnabled ? mentionTexts.crtOn.defaultMessage : mentionTexts.crtOff.defaultMessage,
                        })}
                        testID='notification_settings.mentions.option'
                    />
                    <SettingItem
                        optionName='push_notification'
                        onPress={goToNotificationSettingsPush}
                        testID='notification_settings.push_notifications.option'
                    />
                </>
            )}
            {callsRingingEnabled &&
                <SettingItem
                    optionName='call_notification'
                    onPress={goToNotificationSettingsCall}
                    info={intl.formatMessage({
                        id: callsNotificationsOn ? mentionTexts.callsOn.id : mentionTexts.callsOff.id,
                        defaultMessage: callsNotificationsOn ? mentionTexts.callsOn.defaultMessage : mentionTexts.callsOff.defaultMessage,
                    })}
                    testID='notification_settings.call_notifications.option'
                />
            }
            {!HIDE_ADVANCED_NOTIFICATION_SETTINGS && (
                <SettingItem
                    optionName='email'
                    onPress={goToEmailSettings}
                    info={intl.formatMessage(getEmailIntervalTexts(emailIntervalPref))}
                    testID='notification_settings.email_notifications.option'
                />
            )}
            {enableAutoResponder && (
                <SettingItem
                    onPress={goToNotificationAutoResponder}
                    optionName='automatic_dm_replies'
                    info={currentUser?.status === General.OUT_OF_OFFICE && notifyProps.auto_responder_active === 'true' ? 'On' : 'Off'}
                    testID='notification_settings.automatic_replies.option'
                />
            )}
            {!HIDE_ADVANCED_NOTIFICATION_SETTINGS && (
                <SendTestNotificationNotice
                    serverVersion={serverVersion}
                    userId={currentUser?.id || ''}
                />
            )}
        </SettingContainer>
    );
};

export default Notifications;
