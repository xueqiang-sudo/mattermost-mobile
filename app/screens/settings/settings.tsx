// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {nativeApplicationVersion, nativeBuildVersion} from 'expo-application';
import React, {useCallback, useEffect, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Platform} from 'react-native';

import CompassIcon from '@components/compass_icon';
import MenuDivider from '@components/menu_divider';
import SettingContainer from '@components/settings/container';
import SettingItem from '@components/settings/item';
import {Screens} from '@constants';
import {useServerDisplayName} from '@context/server';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal, goToScreen, setButtons} from '@screens/navigation';

import ReportProblem from './report_problem';

import type {AvailableScreens} from '@typings/screens/navigation';

const CLOSE_BUTTON_ID = 'close-settings';

type SettingsProps = {
    componentId: AvailableScreens;
    siteName: string;
}

const Settings = ({componentId, siteName}: SettingsProps) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverDisplayName = useServerDisplayName();

    const appTitle = intl.formatMessage({id: 'mobile.app.display_name', defaultMessage: 'Optibot'}) || siteName || serverDisplayName;

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

    const goToDisplaySettings = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.SETTINGS_DISPLAY;
        const title = intl.formatMessage({id: 'settings.display', defaultMessage: 'Display'});

        goToScreen(screen, title);
    }, [intl]));

    const goToAbout = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.ABOUT;
        const title = intl.formatMessage({id: 'settings.about', defaultMessage: 'About {appTitle}'}, {appTitle});

        goToScreen(screen, title);
    }, [intl, appTitle]));

    const goToManageEnterprise = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.MANAGE_ENTERPRISE;
        const title = intl.formatMessage({id: 'settings.manage_enterprise', defaultMessage: 'Manage enterprises'});

        goToScreen(screen, title);
    }, [intl]));

    const aboutAppVersionInfo = useMemo(() => {
        return intl.formatMessage({
            id: 'mobile.about.appVersion',
            defaultMessage: 'App Version: {version} (Build {number})',
        }, {
            version: nativeApplicationVersion ?? '0.0.0',
            number: nativeBuildVersion ?? '0',
        });
    }, [intl]);

    return (
        <SettingContainer testID='settings'>
            <SettingItem
                onPress={goToDisplaySettings}
                optionName='display'
                testID='settings.display.option'
            />
            <SettingItem
                onPress={goToManageEnterprise}
                optionName='manage_enterprise'
                testID='settings.manage_enterprise.option'
            />
            <SettingItem
                icon='information-outline'
                info={aboutAppVersionInfo}
                label={intl.formatMessage({id: 'settings.about', defaultMessage: 'About {appTitle}'}, {appTitle})}
                longInfo={true}
                onPress={goToAbout}
                optionName='about'
                testID='settings.about.option'
            />
            {Platform.OS === 'android' && <MenuDivider/>}
            <ReportProblem/>
        </SettingContainer>
    );
};

export default Settings;
