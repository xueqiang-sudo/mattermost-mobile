// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// 是否为手机号格式（例如: 中国11位手机号、+国家码手机号）
export const isPhoneNumber = (str: string) => {
    if (!str || typeof str !== 'string') {
        return false;
    }

    // 正则表达式匹配手机号格式
    if (str === '') {
        return false;
    }
    if (str.startsWith('+86 ')) {
        // eslint-disable-next-line no-param-reassign
        str = str.replace('+86 ', '');
    }

    // 如果以 + 开头，后面跟着国家码（例如 +86 13800000000）
    if (new RegExp('^\\+\\d+ \\d+$').test(str)) {
        return true;
    }

    // 中国手机号（11位）
    return new RegExp('^1[3-9]\\d{9}$').test(str);
};

export const splitPhone = (phone: string): [areaCode: string, number: string] => {
    if (!phone || !isPhoneNumber(phone)) {
        return ['', ''];
    }
    if (phone.startsWith('+')) {
        const index = phone.indexOf(' ');
        if (index === -1) {
            return ['', phone];
        }
        return [phone.slice(0, index), phone.slice(index + 1)];
    }
    return ['', phone];
};

export const formatPhone = (phone: string, keepSpace = false): string => phone.replace('+86 ', '').replace(' ', keepSpace ? ' ' : '');
export const formatEmail = (email: string): string => email.trim().replace('@', '_AT_');

export const checkPhoneRule = (areaCode: string, phoneValue: string): string | undefined => {
    // eslint-disable-next-line no-unused-expressions, no-param-reassign
    !areaCode && (areaCode = '+86'); // 默认中国大陆手机号
    switch (areaCode) {
        case '+86': // 中国大陆手机号
            if (!/^1[3-9]\d{9}$/.test(phoneValue)) {
                return 'Please enter a valid 11-digit phone number';
            }
            break;
        case '+852': // 香港手机号
            if (!/^[569]\d{7}$/.test(phoneValue)) {
                return 'Please enter a valid 8-digit phone number';
            }
            break;
        case '+853': // 澳门手机号
            if (!/^6\d{7}$/.test(phoneValue)) {
                return 'Please enter a valid 8-digit phone number';
            }
            break;
        case '+886': // 台湾手机号
            if (!/^09\d{8}$/.test(phoneValue)) {
                return 'Please enter a valid 10-digit phone number';
            }
            break;
        default:
            // 其他所有国家和地区，只需要是数字即可
            if (!/^\d+$/.test(phoneValue)) {
                return 'Please enter a valid phone number';
            }
            break;
    }
    return undefined;
};

export const phoneToUsername = (phone: string): string => `Phone_${formatPhone(phone)}`;
