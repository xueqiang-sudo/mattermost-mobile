// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getLocaleFromLanguage} from '@i18n';

function resolveTimezone(timezone: UserTimezone | string): string | undefined {
    if (typeof timezone === 'object') {
        const zone = timezone.useAutomaticTimezone ? timezone.automaticTimezone : timezone.manualTimezone;
        return zone || undefined;
    }
    return timezone || undefined;
}

/**
 * 按用户 locale 与 12/24 小时制偏好格式化时间。
 * 12 小时制遵循各语言惯例（如 zh-CN「上午10:58」、en-US「10:58 AM」）。
 */
export function getFormattedTime(
    isMilitaryTime: boolean,
    timezone: UserTimezone | string,
    value: number | string | Date,
    locale?: string,
) {
    const date = value instanceof Date ? value : new Date(value);
    const timeZone = resolveTimezone(timezone);
    const resolvedLocale = locale ? getLocaleFromLanguage(locale) : undefined;

    const options: Intl.DateTimeFormatOptions = {
        hour: 'numeric',
        minute: '2-digit',
        hour12: !isMilitaryTime,
    };
    if (timeZone) {
        options.timeZone = timeZone;
    }

    return date.toLocaleTimeString(resolvedLocale, options);
}
