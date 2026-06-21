// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useMemo} from 'react';
import {useIntl} from 'react-intl';
import {Alert} from 'react-native';

import {updateMe} from '@actions/remote/user';
import SettingBlock from '@components/settings/block';
import SettingContainer from '@components/settings/container';
import SettingOption from '@components/settings/option';
import SettingSeparator from '@components/settings/separator';
import {useServerUrl} from '@context/server';
import useAndroidHardwareBackHandler from '@hooks/android_back_handler';
import useBackNavigation from '@hooks/navigate_back';
import {usePreventDoubleTap} from '@hooks/utils';
import {getLocaleFromLanguage, resetMomentLocale} from '@i18n';
import {popTopScreen} from '@screens/navigation';
import {logError} from '@utils/log';

import type UserModel from '@typings/database/models/servers/user';
import type {AvailableScreens} from '@typings/screens/navigation';

const SUPPORTED_APP_LOCALES = ['en', 'zh-CN', 'zh-TW'] as const;

type DisplayLanguageProps = {
    componentId: AvailableScreens;
    currentUser?: UserModel;
};

const DisplayLanguage = ({componentId, currentUser}: DisplayLanguageProps) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();

    const effectiveLocale = useMemo(
        () => getLocaleFromLanguage(currentUser?.locale ?? ''),
        [currentUser?.locale],
    );

    const close = useCallback(() => {
        popTopScreen(componentId);
    }, [componentId]);

    useAndroidHardwareBackHandler(componentId, close);
    useBackNavigation(close);

    const selectLanguage = useCallback(async (raw: string | boolean) => {
        if (typeof raw !== 'string') {
            return;
        }
        const locale = raw;
        if (locale === effectiveLocale) {
            popTopScreen(componentId);
            return;
        }

        const {error} = await updateMe(serverUrl, {locale});
        if (error) {
            logError('[DisplayLanguage.selectLanguage]', error);
            Alert.alert(
                intl.formatMessage({
                    id: 'mobile.display_settings.language.error_title',
                    defaultMessage: 'Couldn\'t update language',
                }),
                intl.formatMessage({
                    id: 'mobile.display_settings.language.update_error',
                    defaultMessage: 'Something went wrong. Check your connection and try again.',
                }),
            );
            return;
        }

        resetMomentLocale(locale);
        popTopScreen(componentId);
    }, [componentId, effectiveLocale, intl, serverUrl]);

    const onSelectLanguage = usePreventDoubleTap(selectLanguage);

    return (
        <SettingContainer testID='display_language_settings'>
            <SettingBlock disableHeader={true}>
                <SettingOption
                    action={onSelectLanguage}
                    label={intl.formatMessage({
                        id: 'mobile.display_settings.language.english',
                        defaultMessage: 'English',
                    })}
                    selected={effectiveLocale === SUPPORTED_APP_LOCALES[0]}
                    testID='display_language_settings.locale.en'
                    type='select'
                    value={SUPPORTED_APP_LOCALES[0]}
                />
                <SettingSeparator/>
                <SettingOption
                    action={onSelectLanguage}
                    label={intl.formatMessage({
                        id: 'mobile.display_settings.language.simplified_chinese',
                        defaultMessage: 'Simplified Chinese',
                    })}
                    selected={effectiveLocale === SUPPORTED_APP_LOCALES[1]}
                    testID='display_language_settings.locale.zh_cn'
                    type='select'
                    value={SUPPORTED_APP_LOCALES[1]}
                />
                <SettingSeparator/>
                <SettingOption
                    action={onSelectLanguage}
                    label={intl.formatMessage({
                        id: 'mobile.display_settings.language.traditional_chinese',
                        defaultMessage: 'Traditional Chinese',
                    })}
                    selected={effectiveLocale === SUPPORTED_APP_LOCALES[2]}
                    testID='display_language_settings.locale.zh_tw'
                    type='select'
                    value={SUPPORTED_APP_LOCALES[2]}
                />
                <SettingSeparator/>
            </SettingBlock>
        </SettingContainer>
    );
};

export default DisplayLanguage;
