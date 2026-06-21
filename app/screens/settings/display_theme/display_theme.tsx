// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';

import {storeDarkModeSetting} from '@actions/app/global';
import SettingBlock from '@components/settings/block';
import SettingContainer from '@components/settings/container';
import SettingOption from '@components/settings/option';
import SettingSeparator from '@components/settings/separator';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useBackNavigation from '@hooks/navigate_back';
import {usePreventDoubleTap} from '@hooks/utils';
import {observeDarkModeSetting} from '@queries/app/global';
import {popTopScreen} from '@screens/navigation';
import {
    DARK_MODE_SETTING,
    parseStoredDarkModeSetting,
    type DarkModeSetting,
} from '@utils/theme/dark_mode';

import type {AvailableScreens} from '@typings/screens/navigation';

type DisplayThemeProps = {
    componentId: AvailableScreens;
}

const DisplayTheme = ({componentId}: DisplayThemeProps) => {
    const intl = useIntl();
    const [followSystem, setFollowSystem] = useState(true);
    const [manualMode, setManualMode] = useState<typeof DARK_MODE_SETTING.LIGHT | typeof DARK_MODE_SETTING.DARK>(
        DARK_MODE_SETTING.LIGHT,
    );

    useEffect(() => {
        const subscription = observeDarkModeSetting().subscribe((record) => {
            const setting = parseStoredDarkModeSetting(record?.value);
            setFollowSystem(setting === DARK_MODE_SETTING.SYSTEM);
            setManualMode(setting === DARK_MODE_SETTING.DARK ? DARK_MODE_SETTING.DARK : DARK_MODE_SETTING.LIGHT);
        });

        return () => subscription.unsubscribe();
    }, []);

    const close = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    const persistDarkModeSetting = useCallback(async (setting: DarkModeSetting) => {
        await storeDarkModeSetting(setting);
    }, []);

    const onToggleFollowSystem = usePreventDoubleTap(useCallback(async (enabled: string | boolean) => {
        const isEnabled = Boolean(enabled);
        setFollowSystem(isEnabled);

        if (isEnabled) {
            await persistDarkModeSetting(DARK_MODE_SETTING.SYSTEM);
            return;
        }

        await persistDarkModeSetting(manualMode);
    }, [manualMode, persistDarkModeSetting]));

    const onSelectManualMode = usePreventDoubleTap(useCallback(async (value: string | boolean) => {
        if (typeof value !== 'string') {
            return;
        }

        const nextMode = value as typeof DARK_MODE_SETTING.LIGHT | typeof DARK_MODE_SETTING.DARK;
        setManualMode(nextMode);
        await persistDarkModeSetting(nextMode);
    }, [persistDarkModeSetting]));

    useBackNavigation(close);
    useAndroidHardwareBackHandler(componentId, close);

    return (
        <SettingContainer testID='theme_display_settings'>
            <SettingBlock disableHeader={true}>
                <SettingOption
                    action={onToggleFollowSystem}
                    description={intl.formatMessage({
                        id: 'mobile.display_settings.dark_mode.follow_system.description',
                        defaultMessage: 'When enabled, Dark Mode will turn on or off according to the system settings',
                    })}
                    label={intl.formatMessage({
                        id: 'mobile.display_settings.dark_mode.follow_system',
                        defaultMessage: 'Follow system',
                    })}
                    selected={followSystem}
                    testID='theme_display_settings.follow_system.option'
                    type='toggle'
                />
            </SettingBlock>
            {!followSystem && (
                <SettingBlock
                    headerText={{
                        id: 'mobile.display_settings.dark_mode.manual_select',
                        defaultMessage: 'Manual selection',
                    }}
                >
                    <SettingOption
                        action={onSelectManualMode}
                        label={intl.formatMessage({
                            id: 'mobile.display_settings.dark_mode.light_mode',
                            defaultMessage: 'Normal mode',
                        })}
                        selected={manualMode === DARK_MODE_SETTING.LIGHT}
                        testID='theme_display_settings.light_mode.option'
                        type='select'
                        value={DARK_MODE_SETTING.LIGHT}
                    />
                    <SettingSeparator/>
                    <SettingOption
                        action={onSelectManualMode}
                        label={intl.formatMessage({
                            id: 'mobile.display_settings.dark_mode.dark_mode',
                            defaultMessage: 'Dark mode',
                        })}
                        selected={manualMode === DARK_MODE_SETTING.DARK}
                        testID='theme_display_settings.dark_mode.option'
                        type='select'
                        value={DARK_MODE_SETTING.DARK}
                    />
                    <SettingSeparator/>
                </SettingBlock>
            )}
        </SettingContainer>
    );
};

export default DisplayTheme;
