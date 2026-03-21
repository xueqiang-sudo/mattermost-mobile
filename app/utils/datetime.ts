// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export function isSameDate(a: Date, b: Date = new Date()): boolean {
    return a.getDate() === b.getDate() && isSameMonth(a, b) && isSameYear(a, b);
}

export function isSameMonth(a: Date, b: Date = new Date()): boolean {
    return a.getMonth() === b.getMonth() && isSameYear(a, b);
}

export function isSameYear(a: Date, b: Date = new Date()): boolean {
    return a.getFullYear() === b.getFullYear();
}

export function isToday(date: Date) {
    const now = new Date();

    return isSameDate(date, now);
}

export function isYesterday(date: Date): boolean {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    return isSameDate(date, yesterday);
}

export function toMilliseconds({days, hours, minutes, seconds}: {days?: number; hours?: number; minutes?: number; seconds?: number}) {
    const totalSeconds = toSeconds({days, hours, minutes, seconds});
    return totalSeconds * 1000;
}

export function toSeconds({days, hours, minutes, seconds}: {days?: number; hours?: number; minutes?: number; seconds?: number}) {
    const totalHours = ((days || 0) * 24) + (hours || 0);
    const totalMinutes = (totalHours * 60) + (minutes || 0);
    const totalSeconds = (totalMinutes * 60) + (seconds || 0);
    return totalSeconds;
}

export function getReadableTimestamp(timestamp: number, timeZone: string, isMilitaryTime: boolean, currentUserLocale: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const isCurrentYear = date.getFullYear() === now.getFullYear();

    const options: Intl.DateTimeFormatOptions = {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: !isMilitaryTime,
        timeZone: timeZone as string,
        ...(isCurrentYear ? {} : {year: 'numeric'}),
    };

    return date.toLocaleString(currentUserLocale, options);
}

export function formatTime(seconds: number) {
    const h = Math.max(Math.floor(seconds / 3600), 0);
    const m = Math.max(Math.floor((seconds % 3600) / 60), 0);
    const s = Math.max(Math.floor(seconds % 60), 0);

    const hh = h > 0 ? `${h}:` : '';
    const mm = h > 0 ? `${m.toString().padStart(2, '0')}` : `${m}`;
    const ss = s.toString().padStart(2, '0');

    return `${hh}${mm}:${ss}`;
}

export type ConversationTimestampFormat =
    | {type: 'time'; value: string}
    | {type: 'yesterday'}
    | {type: 'weekday'; date: Date}
    | {type: 'date'; value: string};

type LocaleAndTimezone = {locale?: string; timeZone?: string};

/**
 * 企业微信风格会话列表时间戳：当天 "HH:mm"，昨天用 date_separator.yesterday，
 * 本周用 locale 的 weekday short，更早 "M/d"
 * @param timeZone 用户时区（如 Asia/Shanghai），与聊天消息保持一致；空则使用设备默认
 */
export function getConversationTimestampFormat(timestamp: number, opts?: LocaleAndTimezone): ConversationTimestampFormat {
    const date = new Date(timestamp);
    const now = new Date();
    const fmtOpts: Intl.DateTimeFormatOptions = opts?.timeZone ? {timeZone: opts.timeZone} : {};
    if (isToday(date)) {
        const value = date.toLocaleTimeString(opts?.locale, {hour: '2-digit', minute: '2-digit', hour12: false, ...fmtOpts});
        return {type: 'time', value};
    }
    if (isYesterday(date)) {
        return {type: 'yesterday'};
    }
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays < 7) {
        return {type: 'weekday', date};
    }
    const value = date.toLocaleDateString(opts?.locale, {month: 'numeric', day: 'numeric', ...fmtOpts});
    return {type: 'date', value};
}

export function formatDate(date?: Date, isNumeric?: boolean) {
    // eslint-disable-next-line no-unused-expressions, no-param-reassign
    !date && (date = new Date());
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${formatTime(date.getTime() / 1000)}`;
    return isNumeric ? dateStr.replace(/(-|:| )/g, '') : dateStr;
}
