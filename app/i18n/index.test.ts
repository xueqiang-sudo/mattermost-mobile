// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import moment from 'moment';
import {getLocales} from 'react-native-localize';

import en from '@assets/i18n/en.json';
import * as logUtils from '@utils/log';

import {
    getLocaleFromLanguage,
    resetMomentLocale,
    getTranslations,
    getLocalizedMessage,
    DEFAULT_LOCALE,
} from './index';

jest.mock('react-native-localize', () => ({
    getLocales: jest.fn().mockReturnValue([{languageTag: 'en'}]),
}));

jest.mock('@utils/log', () => ({
    logError: jest.fn(),
}));

jest.mock('@assets/i18n/en.json', () => ({test: 'Test', hello: 'Hello'}));
jest.mock('@assets/i18n/zh-CN.json', () => ({test: '测试', hello: '你好'}));
jest.mock('@assets/i18n/zh-TW.json', () => ({test: '測試', hello: '你好'}));

describe('i18n', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(getLocales).mockReturnValue([{
            languageTag: 'en',
            languageCode: '',
            countryCode: '',
            isRTL: false,
        }]);
    });

    describe('getLocaleFromLanguage', () => {
        it('returns correct locale for supported languages', () => {
            expect(getLocaleFromLanguage('zh-TW')).toBe('zh-TW');
            expect(getLocaleFromLanguage('zh-CN')).toBe('zh-CN');
            expect(getLocaleFromLanguage('en')).toBe('en');
        });

        it('returns correct locale for Chinese variants', () => {
            expect(getLocaleFromLanguage('zh-Hans-CN')).toBe('zh-CN');
            expect(getLocaleFromLanguage('zh-Hant-TW')).toBe('zh-TW');
        });

        it('returns default locale for unsupported language', () => {
            expect(getLocaleFromLanguage('es')).toBe('en');
            expect(getLocaleFromLanguage('xx')).toBe('en');
            expect(getLocaleFromLanguage('')).toBe('en');
            expect(getLocaleFromLanguage('not-valid')).toBe('en');
        });
    });

    describe('resetMomentLocale', () => {
        let spy: jest.SpyInstance;

        beforeEach(() => {
            spy = jest.spyOn(moment, 'locale');
        });

        afterEach(() => {
            spy.mockRestore();
        });

        it('sets moment locale correctly for various languages', () => {
            resetMomentLocale('en');
            expect(spy).toHaveBeenCalledWith('en');

            resetMomentLocale('zh-TW');
            expect(spy).toHaveBeenCalledWith('zh-tw');

            resetMomentLocale('zh-CN');
            expect(spy).toHaveBeenCalledWith('zh-cn');
        });

        it('uses default locale when no locale provided', () => {
            resetMomentLocale();
            expect(spy).toHaveBeenCalledWith(
                DEFAULT_LOCALE.toLowerCase().replace('_', '-'),
            );
        });

        it('handles invalid locales gracefully', () => {
            resetMomentLocale('invalid-locale');
            expect(spy).toHaveBeenCalledWith('invalid-locale');

            resetMomentLocale('');
            expect(spy).toHaveBeenCalledWith(
                DEFAULT_LOCALE.toLowerCase().replace('_', '-'),
            );
        });
    });

    describe('getTranslations', () => {
        beforeEach(() => {
            (logUtils.logError as jest.Mock).mockClear();
        });

        it('returns correct translations for supported locales', () => {
            const enTranslations = getTranslations('en');
            expect(enTranslations.hello).toBe('Hello');
            expect(enTranslations.test).toBe('Test');

            const zhCNTranslations = getTranslations('zh-CN');
            expect(zhCNTranslations.hello).toBe('你好');
            expect(zhCNTranslations.test).toBe('测试');

            const zhTWTranslations = getTranslations('zh-TW');
            expect(zhTWTranslations.hello).toBe('你好');
            expect(zhTWTranslations.test).toBe('測試');
        });

        it('returns english translations for unsupported locale', () => {
            const translations = getTranslations('xx');
            expect(translations).toEqual(en);
            expect(logUtils.logError).not.toHaveBeenCalled();
        });

        it('returns english for other locale codes', () => {
            const translations = getTranslations('es');
            expect(translations.hello).toBe('Hello');
            expect(translations.test).toBe('Test');
        });
    });

    describe('getLocalizedMessage', () => {
        it('returns correct message for existing key in various languages', () => {
            expect(getLocalizedMessage('en', 'test')).toBe('Test');
            expect(getLocalizedMessage('zh-CN', 'test')).toBe('测试');
            expect(getLocalizedMessage('en', 'hello')).toBe('Hello');
            expect(getLocalizedMessage('zh-CN', 'hello')).toBe('你好');
        });

        it('returns default message when key not found', () => {
            expect(getLocalizedMessage('en', 'nonexistent', 'Default')).toBe('Default');
            expect(getLocalizedMessage('zh-CN', 'nonexistent', '默认')).toBe('默认');
        });

        it('returns empty string when no translation or default', () => {
            expect(getLocalizedMessage('en', 'nonexistent')).toBe('');
            expect(getLocalizedMessage('zh-CN', 'nonexistent')).toBe('');
        });

        it('handles invalid inputs gracefully', () => {
            expect(getLocalizedMessage('', 'test')).toBe('Test');
            expect(getLocalizedMessage('invalid-locale', 'test')).toBe('Test');
            expect(getLocalizedMessage('en', '')).toBe('');
            expect(getLocalizedMessage('en', undefined as unknown as string)).toBe('');
            expect(getLocalizedMessage('en', null as unknown as string)).toBe('');
        });
    });
});
