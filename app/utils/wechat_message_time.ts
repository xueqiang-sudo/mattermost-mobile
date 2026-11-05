// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import moment from 'moment-timezone';

import {getLocaleFromLanguage} from '@i18n';
import {getFormattedTime} from '@utils/time';
import {isToday, isYesterday, isDayBeforeYesterday} from '@utils/datetime';

import type {IntlShape} from 'react-intl';

function isChineseLocale(locale: string): boolean {
    return getLocaleFromLanguage(locale).startsWith('zh');
}

function isTraditionalChinese(locale: string): boolean {
    const loc = getLocaleFromLanguage(locale);
    return loc === 'zh-TW' || loc === 'zh-HK' || loc.startsWith('zh-TW') || loc.startsWith('zh-HK');
}

/** 微信风格月日：中文「6月14日」；其他语言走 locale（如 en-US「Jun 14」） */
function formatWeChatMonthDayDate(
    intl: IntlShape,
    createAt: number,
    timeZone: string,
    includeYear: boolean,
): string {
    if (isChineseLocale(intl.locale)) {
        const m = moment.tz(createAt, timeZone);
        return includeYear ? m.format('YYYY[年]M[月]D[日]') : m.format('M[月]D[日]');
    }

    return intl.formatDate(new Date(createAt), {
        day: 'numeric',
        month: 'short',
        ...(includeYear ? {year: 'numeric'} : {}),
        timeZone,
    });
}

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
    const timeStr = getFormattedTime(isMilitaryTime, zone, createAt, intl.locale);

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
            {date: formatWeChatMonthDayDate(intl, createAt, zone, false), time: timeStr},
        );
    }

    return intl.formatMessage(
        {id: 'wechat_time.full_date_time', defaultMessage: '{date} {time}'},
        {date: formatWeChatMonthDayDate(intl, createAt, zone, true), time: timeStr},
    );
}

/**
 * 微信风格消息时间分隔符格式化
 * - 当天：仅时间
 * - 昨天：昨天 HH:mm
 * - 前天：前天 HH:mm
 * - 本周内（3-7天）：星期X HH:mm
 * - 超过一周：日期+时间（M月D日 HH:mm），跨年显示年
 */
export function formatTimeSeparatorLabel(
    intl: IntlShape,
    createAt: number,
    timezone: string | undefined,
    isMilitaryTime: boolean,
): string {
    const zone = timezone || moment.tz.guess();
    const m = moment.tz(createAt, zone);
    const now = moment.tz(zone);
    moment.locale(getLocaleFromLanguage(intl.locale).toLowerCase());
    const timeStr = getFormattedTime(isMilitaryTime, zone, createAt, intl.locale);

    if (isToday(m.toDate())) {
        return timeStr;
    }

    if (isYesterday(m.toDate())) {
        return intl.formatMessage(
            {id: 'wechat_time.yesterday_time', defaultMessage: 'Yesterday {time}'},
            {time: timeStr},
        );
    }

    if (isDayBeforeYesterday(m.toDate())) {
        return intl.formatMessage(
            {id: 'wechat_time.day_before_yesterday_time', defaultMessage: 'Day before yesterday {time}'},
            {time: timeStr},
        );
    }

    // 本周内（3-7天）：使用 ISO 周判断，避免跨周问题
    if (m.isSame(now, 'isoWeek')) {
        const weekday = intl.formatDate(new Date(createAt), {weekday: 'long', timeZone: zone});
        return intl.formatMessage(
            {id: 'wechat_time.weekday_time_separator', defaultMessage: '{weekday} {time}'},
            {weekday, time: timeStr},
        );
    }

    // 超过一周：日期+时间，跨年显示年
    const isSameYear = m.year() === now.year();
    const dateStr = formatWeChatMonthDayDate(intl, createAt, zone, !isSameYear);
    return intl.formatMessage(
        {id: 'wechat_time.year_month_day_time', defaultMessage: '{date} {time}'},
        {date: dateStr, time: timeStr},
    );
}

/**
 * 微信风格聊天列表右上角时间格式化（24小时制）
 * - 今天：HH:mm
 * - 昨天：昨天 HH:mm / 昨天 HH:mm / Yesterday HH:mm
 * - 本周内（含前天及7天内）：星期X / 星期X / Weekday（不显示时间）
 * - 今年内（超过一周）：M月D日 HH:mm / M月D日 HH:mm / MMM D HH:mm
 * - 跨年：YYYY/M/D（不显示时间）
 */
export function formatChannelListTime(
    intl: IntlShape,
    timestamp: number,
    timezone: string | undefined,
): string {
    const zone = timezone || moment.tz.guess();
    const m = moment.tz(timestamp, zone);
    const now = moment.tz(zone);
    moment.locale(getLocaleFromLanguage(intl.locale).toLowerCase());

    // 强制 24 小时制
    const timeStr = m.format('HH:mm');

    // 今天：仅时间
    if (isToday(m.toDate())) {
        return timeStr;
    }

    // 昨天：昨天 HH:mm
    if (isYesterday(m.toDate())) {
        return intl.formatMessage(
            {id: 'channel_list_time.yesterday_time', defaultMessage: 'Yesterday {time}'},
            {time: timeStr},
        );
    }

    // 本周内（前天~7天）：星期X（不显示时间）
    if (m.isSame(now, 'isoWeek') || m.isAfter(now.clone().subtract(7, 'days'))) {
        // 中文简/繁体使用"星期X"格式，其他语言使用 weekday 名称
        if (isChineseLocale(intl.locale)) {
            const weekdaysZhCN = ['日', '一', '二', '三', '四', '五', '六'];
            const weekdaysZhTW = ['日', '一', '二', '三', '四', '五', '六'];
            const weekdays = isTraditionalChinese(intl.locale) ? weekdaysZhTW : weekdaysZhCN;
            const dayOfWeek = m.day();
            const weekday = isTraditionalChinese(intl.locale)
                ? `星期${weekdays[dayOfWeek]}`
                : `星期${weekdays[dayOfWeek]}`;
            return weekday;
        }
        const weekday = intl.formatDate(new Date(timestamp), {weekday: 'short', timeZone: zone});
        return weekday;
    }

    // 跨年：YYYY/M/D（不显示时间）
    if (!m.isSame(now, 'year')) {
        return m.format('YYYY/M/D');
    }

    // 今年内（超过一周）：M月D日 HH:mm
    if (isChineseLocale(intl.locale)) {
        if (isTraditionalChinese(intl.locale)) {
            return m.format('M[月]D[日] ') + timeStr;
        }
        return m.format('M[月]D[日] ') + timeStr;
    }
    return intl.formatDate(new Date(timestamp), {
        month: 'short',
        day: 'numeric',
        timeZone: zone,
    }) + ' ' + timeStr;
}
