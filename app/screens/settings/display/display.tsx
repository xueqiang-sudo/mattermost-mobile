// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {defineMessage, type MessageDescriptor, useIntl} from 'react-intl';

import SettingContainer from '@components/settings/container';
import SettingItem from '@components/settings/item';
import {Screens} from '@constants';
import {useTheme} from '@context/theme';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import {usePreventDoubleTap} from '@hooks/utils';
import {getLocaleFromLanguage} from '@i18n';
import {goToScreen, popTopScreen} from '@screens/navigation';
import {gotoSettingsScreen} from '@screens/settings/config';
import {getUserTimezoneProps} from '@utils/user';

import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

const TIME_FORMAT = [
    defineMessage({
        id: 'display_settings.clock.standard',
        defaultMessage: '12-hour',
    }),
    defineMessage({
        id: 'display_settings.clock.military',
        defaultMessage: '24-hour',
    }),
];

const TIMEZONE_FORMAT = [
    defineMessage({
        id: 'display_settings.tz.auto',
        defaultMessage: 'Auto',
    }),
    defineMessage({
        id: 'display_settings.tz.manual',
        defaultMessage: 'Manual',
    }),
];

const LANGUAGE_LABEL_EN: MessageDescriptor = {
    id: 'mobile.display_settings.language.english',
    defaultMessage: 'English',
};
const LANGUAGE_LABEL_ZH_CN: MessageDescriptor = {
    id: 'mobile.display_settings.language.simplified_chinese',
    defaultMessage: 'Simplified Chinese',
};
const LANGUAGE_LABEL_ZH_TW: MessageDescriptor = {
    id: 'mobile.display_settings.language.traditional_chinese',
    defaultMessage: 'Traditional Chinese',
};

function getAppLocaleLabelMessage(locale: string): MessageDescriptor {
    const normalized = getLocaleFromLanguage(locale);
    switch (normalized) {
        case 'zh-CN':
            return LANGUAGE_LABEL_ZH_CN;
        case 'zh-TW':
            return LANGUAGE_LABEL_ZH_TW;
        default:
            return LANGUAGE_LABEL_EN;
    }
}

type DisplayProps = {
    componentId: AvailableScreens;
    currentUser?: UserModel;
    hasMilitaryTimeFormat: boolean;
    isThemeSwitchingEnabled: boolean;
}

const Display = ({componentId, currentUser, hasMilitaryTimeFormat, isThemeSwitchingEnabled}: DisplayProps) => {
    const intl = useIntl();
    const theme = useTheme();
    const timezone = useMemo(() => getUserTimezoneProps(currentUser), [currentUser?.timezone]);

    const goToThemeSettings = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.SETTINGS_DISPLAY_THEME;
        const title = intl.formatMessage({id: 'display_settings.theme', defaultMessage: 'Theme'});
        goToScreen(screen, title);
    }, [intl]));

    const goToClockDisplaySettings = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.SETTINGS_DISPLAY_CLOCK;
        const title = intl.formatMessage({id: 'display_settings.clockDisplay', defaultMessage: 'Clock Display'});
        gotoSettingsScreen(screen, title);
    }, [intl]));

    const goToTimezoneSettings = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.SETTINGS_DISPLAY_TIMEZONE;
        const title = intl.formatMessage({id: 'display_settings.timezone', defaultMessage: 'Timezone'});
        gotoSettingsScreen(screen, title);
    }, [intl]));

    const goToLanguageSettings = usePreventDoubleTap(useCallback(() => {
        const screen = Screens.SETTINGS_DISPLAY_LANGUAGE;
        const title = intl.formatMessage({id: 'mobile.display_settings.language.title', defaultMessage: 'Language'});
        gotoSettingsScreen(screen, title);
    }, [intl]));

    const languageInfo = useMemo(
        () => intl.formatMessage(getAppLocaleLabelMessage(currentUser?.locale ?? '')),
        [currentUser?.locale, intl],
    );

    const close = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, close);

    return (
        <SettingContainer testID='display_settings'>
            {isThemeSwitchingEnabled && (
                <SettingItem
                    optionName='theme'
                    onPress={goToThemeSettings}
                    info={theme.type!}
                    testID='display_settings.theme.option'
                />
            )}
            <SettingItem
                optionName='clock'
                onPress={goToClockDisplaySettings}
                info={intl.formatMessage(hasMilitaryTimeFormat ? TIME_FORMAT[1] : TIME_FORMAT[0])}
                testID='display_settings.clock_display.option'
            />
            <SettingItem
                optionName='timezone'
                onPress={goToTimezoneSettings}
                info={intl.formatMessage(timezone.useAutomaticTimezone ? TIMEZONE_FORMAT[0] : TIMEZONE_FORMAT[1])}
                testID='display_settings.timezone.option'
            />
            <SettingItem
                optionName='language'
                onPress={goToLanguageSettings}
                info={languageInfo}
                testID='display_settings.language.option'
            />
        </SettingContainer>
    );
};

export default Display;
