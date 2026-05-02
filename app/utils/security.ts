// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import CookieManager, {type Cookie} from '@react-native-cookies/cookies';
import base64 from 'base-64';
import {Platform} from 'react-native';

export async function getCSRFFromCookie(url: string) {
    const cookies = await CookieManager.get(url, false);
    return cookies.MMCSRF?.value;
}

export async function clearCookies(serverUrl: string, webKit: boolean) {
    try {
        const cookies = await CookieManager.get(serverUrl, webKit);
        const values = Object.values(cookies);
        values.forEach((cookie: Cookie) => {
            CookieManager.clearByName(serverUrl, cookie.name, webKit);
        });
    } catch (error) {
        // Nothing to clear
    }
}

export async function clearCookiesForServer(serverUrl: string) {
    if (Platform.OS === 'ios') {
        clearCookies(serverUrl, false);
        clearCookies(serverUrl, true);
    } else if (Platform.OS === 'android') {
        CookieManager.flush();
    }
}

export const urlSafeBase64Encode = (str: string): string => {
    return base64.encode(str).replace(/\+/g, '-').replace(/\//g, '_');
};

const BASE64_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const CUSTOM_BASE64_CHARSET = 'QWERTYUIOPASDFGHJKLZXCVBNMqwertyuiopasdfghjklzxcvbnm7894560123-_~';

const remapChars = (input: string, fromCharset: string, toCharset: string): string => {
    const map = new Map<string, string>();
    for (let i = 0; i < fromCharset.length; i++) {
        map.set(fromCharset[i], toCharset[i]);
    }

    return Array.from(input, (char) => map.get(char) ?? char).join('');
};

/**
 * 自定义 Base64 编码（带简单加密）
 * @param str 原始字符串
 * @returns 加密后的 Base64 字符串
 */
export const customBase64Encode = (str: string): string => {
    return remapChars(base64.encode(str), BASE64_CHARSET, CUSTOM_BASE64_CHARSET);
};

/**
 * 自定义 Base64 解码（对应加密）
 * @param str 加密后的 Base64 字符串
 * @returns 原始字符串
 */
export const customBase64Decode = (str: string): string => {
    return base64.decode(remapChars(str, CUSTOM_BASE64_CHARSET, BASE64_CHARSET));
};
