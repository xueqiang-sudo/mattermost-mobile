// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect} from 'react';
import {useIntl} from 'react-intl';

import CompassIcon from '@components/compass_icon';
import SettingContainer from '@components/settings/container';
import SettingItem from '@components/settings/item';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal, goToScreen, setButtons} from '@screens/navigation';

import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-settings';

type SettingsProps = {
    componentId: AvailableScreens;
}

const Settings = ({componentId}: SettingsProps) => {
    const theme = useTheme();
    const intl = useIntl();

    const close = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    useEffect(() => {
        setButtons(componentId, {
            leftButtons: [{
                id: CLOSE_BUTTON_ID,
                icon: CompassIcon.getImageSourceSync('close', 24, theme.sidebarHeaderTextColor),
                testID: 'close.settings.button',
            }],
        });
    }, [componentId, theme.sidebarHeaderTextColor]);

    useAndroidHardwareBackHandler(componentId, close);
    useNavButtonPressed(CLOSE_BUTTON_ID, componentId, close, []);

    const goToNotificationSettings = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.SETTINGS_NOTIFICATION;
        const title = intl.formatMessage({id: 'general_settings.notifications', defaultMessage: 'Notifications'});

        goToScreen(screen, title);
    }, [intl]));

    const goToDisplaySettings = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.SETTINGS_DISPLAY;
        const title = intl.formatMessage({id: 'settings.display', defaultMessage: 'Interface and Display'});

        goToScreen(screen, title);
    }, [intl]));

    return (
        <SettingContainer testID='settings'>
            <SettingItem
                onPress={goToNotificationSettings}
                optionName='notification'
                testID='settings.notification.option'
            />
            <SettingItem
                onPress={goToDisplaySettings}
                optionName='display'
                testID='settings.display.option'
            />
        </SettingContainer>
    );
};

export default Settings;
