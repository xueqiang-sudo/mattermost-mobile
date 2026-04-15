// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import moment from 'moment-timezone';

import {getLocaleFromLanguage} from '@i18n';
import {getFormattedTime} from '@utils/time';

import type {IntlShape} from 'react-intl';

/**
 * 微信风格：今天仅时间；昨天「昨天」+时间；今年内「M月D日」+时间；跨年带年份。
 */
export function formatWeChatPostHeaderTime(
    intl: IntlShape,
    createAt: number,
    timezone: string | undefined,
    isMilitaryTime: boolean,
): string {
    const zone = timezone || moment.tz.guess();
    const m = moment.tz(createAt, zone);
    const now = moment.tz(zone);
    moment.locale(getLocaleFromLanguage(intl.locale).toLowerCase());
    const timeStr = getFormattedTime(isMilitaryTime, zone, createAt);

    if (m.isSame(now, 'day')) {
        return timeStr;
    }

    const yesterday = now.clone().subtract(1, 'day');
    if (m.isSame(yesterday, 'day')) {
        return intl.formatMessage(
            {id: 'wechat_time.yesterday_time', defaultMessage: 'Yesterday {time}'},
            {time: timeStr},
        );
    }

    // 本周内（与「今天」「昨天」互斥）：显示星期几 + 时间，贴近微信
    if (m.isSame(now, 'isoWeek')) {
        const weekday = intl.formatDate(new Date(createAt), {weekday: 'long', timeZone: zone});
        return intl.formatMessage(
            {id: 'wechat_time.weekday_time', defaultMessage: '{weekday} {time}'},
            {weekday, time: timeStr},
        );
    }

    if (m.isSame(now, 'year')) {
        return intl.formatMessage(
            {id: 'wechat_time.month_day_time', defaultMessage: '{date} {time}'},
            {date: m.format('M/D'), time: timeStr},
        );
    }

    return intl.formatMessage(
        {id: 'wechat_time.full_date_time', defaultMessage: '{date} {time}'},
        {date: m.format('YYYY/M/D'), time: timeStr},
    );
}
