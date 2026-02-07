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

/**
 * 自定义 Base64 编码（带简单加密）
 * @param str 原始字符串
 * @returns 加密后的 Base64 字符串
 */
export const customBase64Encode = (str: string): string => {
    // 1. 先进行正常的 Base64 编码
    let encoded = base64.encode(str);

    // 2. 简单的字符替换加密
    encoded = encoded.
        replace(/A/g, 'Q').
        replace(/B/g, 'W').
        replace(/C/g, 'E').
        replace(/D/g, 'R').
        replace(/E/g, 'T').
        replace(/F/g, 'Y').
        replace(/G/g, 'U').
        replace(/H/g, 'I').
        replace(/I/g, 'O').
        replace(/J/g, 'P').
        replace(/K/g, 'A').
        replace(/L/g, 'S').
        replace(/M/g, 'D').
        replace(/N/g, 'F').
        replace(/O/g, 'G').
        replace(/P/g, 'H').
        replace(/Q/g, 'J').
        replace(/R/g, 'K').
        replace(/S/g, 'L').
        replace(/T/g, 'Z').
        replace(/U/g, 'X').
        replace(/V/g, 'C').
        replace(/W/g, 'V').
        replace(/X/g, 'B').
        replace(/Y/g, 'N').
        replace(/Z/g, 'M').
        replace(/a/g, 'q').
        replace(/b/g, 'w').
        replace(/c/g, 'e').
        replace(/d/g, 'r').
        replace(/e/g, 't').
        replace(/f/g, 'y').
        replace(/g/g, 'u').
        replace(/h/g, 'i').
        replace(/i/g, 'o').
        replace(/j/g, 'p').
        replace(/k/g, 'a').
        replace(/l/g, 's').
        replace(/m/g, 'd').
        replace(/n/g, 'f').
        replace(/o/g, 'g').
        replace(/p/g, 'h').
        replace(/q/g, 'j').
        replace(/r/g, 'k').
        replace(/s/g, 'l').
        replace(/t/g, 'z').
        replace(/u/g, 'x').
        replace(/v/g, 'c').
        replace(/w/g, 'v').
        replace(/x/g, 'b').
        replace(/y/g, 'n').
        replace(/z/g, 'm').
        replace(/0/g, '7').
        replace(/1/g, '8').
        replace(/2/g, '9').
        replace(/3/g, '4').
        replace(/4/g, '5').
        replace(/5/g, '6').
        replace(/6/g, '0').
        replace(/7/g, '1').
        replace(/8/g, '2').
        replace(/9/g, '3').
        replace(/\+/g, '-').
        replace(/\//g, '_').
        replace(/[=]/g, '~');

    return encoded;
};

/**
 * 自定义 Base64 解码（对应加密）
 * @param str 加密后的 Base64 字符串
 * @returns 原始字符串
 */
export const customBase64Decode = (str: string): string => {
    // 1. 先进行字符替换解密
    const decoded = str.
        replace(/Q/g, 'A').
        replace(/W/g, 'B').
        replace(/E/g, 'C').
        replace(/R/g, 'D').
        replace(/T/g, 'E').
        replace(/Y/g, 'F').
        replace(/U/g, 'G').
        replace(/I/g, 'H').
        replace(/O/g, 'I').
        replace(/P/g, 'J').
        replace(/A/g, 'K').
        replace(/S/g, 'L').
        replace(/D/g, 'M').
        replace(/F/g, 'N').
        replace(/G/g, 'O').
        replace(/H/g, 'P').
        replace(/J/g, 'Q').
        replace(/K/g, 'R').
        replace(/L/g, 'S').
        replace(/Z/g, 'T').
        replace(/X/g, 'U').
        replace(/C/g, 'V').
        replace(/V/g, 'W').
        replace(/B/g, 'X').
        replace(/N/g, 'Y').
        replace(/M/g, 'Z').
        replace(/q/g, 'a').
        replace(/w/g, 'b').
        replace(/e/g, 'c').
        replace(/r/g, 'd').
        replace(/t/g, 'e').
        replace(/y/g, 'f').
        replace(/u/g, 'g').
        replace(/i/g, 'h').
        replace(/o/g, 'i').
        replace(/p/g, 'j').
        replace(/a/g, 'k').
        replace(/s/g, 'l').
        replace(/d/g, 'm').
        replace(/f/g, 'n').
        replace(/g/g, 'o').
        replace(/h/g, 'p').
        replace(/j/g, 'q').
        replace(/k/g, 'r').
        replace(/l/g, 's').
        replace(/z/g, 't').
        replace(/x/g, 'u').
        replace(/c/g, 'v').
        replace(/v/g, 'w').
        replace(/b/g, 'x').
        replace(/n/g, 'y').
        replace(/m/g, 'z').
        replace(/7/g, '0').
        replace(/8/g, '1').
        replace(/9/g, '2').
        replace(/4/g, '3').
        replace(/5/g, '4').
        replace(/6/g, '5').
        replace(/0/g, '6').
        replace(/1/g, '7').
        replace(/2/g, '8').
        replace(/3/g, '9').
        replace(/-/g, '+').
        replace(/_/g, '/').
        replace(/~/g, '=');

    // 2. 再进行正常的 Base64 解码
    return base64.decode(decoded);
};
