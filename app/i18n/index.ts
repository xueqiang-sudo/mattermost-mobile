// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import moment from 'moment';
import {getLocales} from 'react-native-localize';
import 'moment/min/locales';

import en from '@assets/i18n/en.json';
import {logError} from '@utils/log';

import availableLanguages from './languages';

const PRIMARY_LOCALE = 'en';
const deviceLocale = getLocales()[0]?.languageTag || PRIMARY_LOCALE;
export const DEFAULT_LOCALE = getLocaleFromLanguage(deviceLocale);

function loadTranslation(locale?: string): {[x: string]: string} {
    try {
        let translations: {[x: string]: string};

        switch (locale) {
            case 'zh-CN':
                loadChinesePolyfills();
                translations = require('@assets/i18n/zh-CN.json');
                break;
            case 'zh-TW':
                loadChinesePolyfills();
                translations = require('@assets/i18n/zh-TW.json');
                break;
            default:
                require('@formatjs/intl-pluralrules/locale-data/en');
                require('@formatjs/intl-numberformat/locale-data/en');
                require('@formatjs/intl-datetimeformat/locale-data/en');
                require('@formatjs/intl-listformat/locale-data/en');
                require('@formatjs/intl-relativetimeformat/locale-data/en');

                translations = en;
                break;
        }

        return translations;
    } catch (e) {
        logError('NO Translation found', e);
        return en;
    }
}

function loadChinesePolyfills() {
    require('@formatjs/intl-pluralrules/locale-data/zh');
    require('@formatjs/intl-numberformat/locale-data/zh');
    require('@formatjs/intl-datetimeformat/locale-data/zh');
    require('@formatjs/intl-listformat/locale-data/zh');
    require('@formatjs/intl-relativetimeformat/locale-data/zh');
}

export function getLocaleFromLanguage(lang: string) {
    switch (lang) {
        case 'zh-Hans-CN': {
            // eslint-disable-next-line no-param-reassign
            lang = 'zh-CN';
            break;
        }
        case 'zh-Hant-TW': {
            // eslint-disable-next-line no-param-reassign
            lang = 'zh-TW';
            break;
        }
    }
    const languageCode = lang.split('-')[0];
    const locale = availableLanguages[lang] || availableLanguages[languageCode] || PRIMARY_LOCALE;
    return locale;
}

export function resetMomentLocale(locale?: string) {
    const momentLocale = (locale || DEFAULT_LOCALE).toLowerCase().replace('_', '-');
    moment.locale(momentLocale);
}

export function getTranslations(lang: string) {
    const locale = getLocaleFromLanguage(lang);
    return loadTranslation(locale);
}

export function getLocalizedMessage(lang: string, id: string, defaultMessage?: string) {
    const locale = getLocaleFromLanguage(lang);
    const translations = getTranslations(locale);

    return translations[id] || defaultMessage || '';
}
