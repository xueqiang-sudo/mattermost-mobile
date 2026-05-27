// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {FlashList, type ListRenderItemInfo} from '@shopify/flash-list';
import React, {useCallback, useMemo, useState} from 'react';
import Clipboard from '@react-native-clipboard/clipboard';
import {Platform, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import type {ConsoleLogEntry} from '@utils/debug_logger';
import type {LogcatLogEntry} from '@utils/logcat_logger';
import type {NetworkLogEntry} from '@utils/network_logger';

type LogEntry = ConsoleLogEntry | NetworkLogEntry | LogcatLogEntry;

type Props = {
    logs: LogEntry[];
    type: 'console' | 'network' | 'logcat';
    onClear: () => void;
    theme: Theme;
};

const SCREEN_PADDING_H = 12;
const ITEM_HEIGHT = 64;

function formatTime(ts: number): string {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `${hh}:${mm}:${ss}.${ms}`;
}

function isConsoleEntry(entry: LogEntry): entry is ConsoleLogEntry {
    return 'level' in entry;
}

function isNetworkEntry(entry: LogEntry): entry is NetworkLogEntry {
    return 'url' in entry;
}

function isLogcatEntry(entry: LogEntry): entry is LogcatLogEntry {
    return 'line' in entry;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {flex: 1},
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SCREEN_PADDING_H,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
        gap: 8,
    },
    searchInput: {
        flex: 1,
        height: 32,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        color: theme.centerChannelColor,
        fontSize: 13,
        lineHeight: 18,
    },
    clearBtn: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.errorTextColor, 0.1),
    },
    clearBtnText: {
        fontSize: 12,
        lineHeight: 16,
        color: theme.errorTextColor,
        fontWeight: '600',
    },
    listContent: {paddingBottom: 16},
    item: {
        paddingHorizontal: SCREEN_PADDING_H,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    itemExpanded: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.03),
    },
    itemHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 2,
    },
    badge: {
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
    },
    badgeText: {
        fontSize: 10,
        lineHeight: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    timestamp: {
        fontSize: 11,
        lineHeight: 16,
        color: changeOpacity(theme.centerChannelColor, 0.4),
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    statusBadge: {
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 4,
    },
    statusBadgeText: {
        fontSize: 10,
        lineHeight: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    summary: {
        fontSize: 13,
        lineHeight: 18,
        color: theme.centerChannelColor,
    },
    summaryMuted: {
        color: changeOpacity(theme.centerChannelColor, 0.6),
    },
    detail: {
        marginTop: 6,
        padding: 8,
        borderRadius: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.05),
    },
    detailText: {
        fontSize: 11,
        lineHeight: 16,
        color: changeOpacity(theme.centerChannelColor, 0.8),
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    copyHint: {
        marginTop: 4,
        fontSize: 10,
        lineHeight: 14,
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'right',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        fontSize: 15,
        lineHeight: 22,
        color: changeOpacity(theme.centerChannelColor, 0.4),
    },
}));

function getBadgeColor(entry: LogEntry, theme: Theme): string {
    if (isConsoleEntry(entry)) {
        switch (entry.level) {
            case 'error': return theme.dndIndicator;
            case 'warn': return theme.awayIndicator;
            default: return changeOpacity(theme.centerChannelColor, 0.5);
        }
    }
    if (isNetworkEntry(entry)) {
        return entry.ok ? theme.onlineIndicator : theme.dndIndicator;
    }
    if (isLogcatEntry(entry)) {
        return changeOpacity(theme.centerChannelColor, 0.5);
    }
    return changeOpacity(theme.centerChannelColor, 0.5);
}

function getBadgeLabel(entry: LogEntry): string {
    if (isConsoleEntry(entry)) {
        return entry.level.toUpperCase();
    }
    if (isNetworkEntry(entry)) {
        return entry.method;
    }
    if (isLogcatEntry(entry)) {
        return 'LCAT';
    }
    return 'LOG';
}

function getSummaryText(entry: LogEntry): string {
    if (isConsoleEntry(entry)) {
        return entry.message.replace(/\n/g, ' ').slice(0, 120);
    }
    if (isNetworkEntry(entry)) {
        try {
            return new URL(entry.url).pathname;
        } catch {
            return entry.url.slice(0, 80);
        }
    }
    if (isLogcatEntry(entry)) {
        return entry.line.slice(0, 120);
    }
    return '';
}

function getDetailText(entry: LogEntry): string {
    if (isConsoleEntry(entry)) {
        return entry.message;
    }
    if (isNetworkEntry(entry)) {
        const parts = [
            `URL: ${entry.url}`,
            `Status: ${entry.status}`,
            `Duration: ${entry.duration}ms`,
            '',
            'Request Headers:',
            ...Object.entries(entry.requestHeaders).map(([k, v]) => `  ${k}: ${v}`),
            '',
            'Request Body:',
            entry.requestBody || '(empty)',
            '',
            'Response:',
            entry.responseBody,
        ];
        return parts.join('\n');
    }
    if (isLogcatEntry(entry)) {
        return entry.line;
    }
    return '';
}

type ItemProps = {
    entry: LogEntry;
    styles: ReturnType<typeof getStyleSheet>;
    theme: Theme;
};

const LogItem = React.memo(({entry, styles, theme}: ItemProps) => {
    const [expanded, setExpanded] = useState(false);
    const badgeColor = getBadgeColor(entry, theme);
    const label = getBadgeLabel(entry);
    const summary = getSummaryText(entry);
    const detail = getDetailText(entry);

    const handleLongPress = useCallback(() => {
        Clipboard.setString(detail);
    }, [detail]);

    const statusCode = isNetworkEntry(entry) ? entry.status : null;
    const duration = isNetworkEntry(entry) ? entry.duration : null;

    return (
        <TouchableOpacity
            style={[styles.item, expanded && styles.itemExpanded]}
            onPress={() => setExpanded((v) => !v)}
            onLongPress={handleLongPress}
            activeOpacity={0.7}
        >
            <View style={styles.itemHeader}>
                <View style={[styles.badge, {backgroundColor: badgeColor}]}>
                    <Text style={styles.badgeText}>{label}</Text>
                </View>
                <Text style={styles.timestamp}>{formatTime(entry.timestamp)}</Text>
                {statusCode !== null && (
                    <View style={[styles.statusBadge, {backgroundColor: isNetworkEntry(entry) && entry.ok ? theme.onlineIndicator : theme.dndIndicator}]}>
                        <Text style={styles.statusBadgeText}>{statusCode}</Text>
                    </View>
                )}
                {duration !== null && (
                    <Text style={styles.timestamp}>{`${duration}ms`}</Text>
                )}
            </View>
            <Text
                style={[styles.summary, !summary && styles.summaryMuted]}
                numberOfLines={expanded ? undefined : 2}
            >
                {summary || '(no message)'}
            </Text>
            {expanded && (
                <View style={styles.detail}>
                    <Text
                        style={styles.detailText}
                        selectable={true}
                    >
                        {detail}
                    </Text>
                    <Text style={styles.copyHint}>长按条目可复制</Text>
                </View>
            )}
        </TouchableOpacity>
    );
});

LogItem.displayName = 'LogItem';

const LogList = ({logs, onClear, theme}: Props) => {
    const styles = getStyleSheet(theme);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) {
            return [...logs].reverse();
        }
        const q = search.toLowerCase();
        return [...logs].reverse().filter((entry) => {
            if (isConsoleEntry(entry)) {
                return entry.message.toLowerCase().includes(q) || entry.level.includes(q);
            }
            if (isNetworkEntry(entry)) {
                return entry.url.toLowerCase().includes(q) || String(entry.status).includes(q) || entry.method.toLowerCase().includes(q);
            }
            if (isLogcatEntry(entry)) {
                return entry.line.toLowerCase().includes(q);
            }
            return false;
        });
    }, [logs, search]);

    const renderItem = useCallback(({item}: ListRenderItemInfo<LogEntry>) => (
        <LogItem
            entry={item}
            styles={styles}
            theme={theme}
        />
    ), [styles, theme]);

    const keyExtractor = useCallback((item: LogEntry) => item.id, []);

    return (
        <View style={styles.container}>
            <View style={styles.searchBar}>
                <TextInput
                    style={styles.searchInput}
                    placeholder='搜索日志...'
                    placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.4)}
                    value={search}
                    onChangeText={setSearch}
                    clearButtonMode='while-editing'
                />
                <TouchableOpacity
                    style={styles.clearBtn}
                    onPress={onClear}
                    activeOpacity={0.7}
                >
                    <Text style={styles.clearBtnText}>清除</Text>
                </TouchableOpacity>
            </View>
            {filtered.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                        {search ? '未找到匹配的日志' : '暂无日志'}
                    </Text>
                </View>
            ) : (
                <FlashList
                    data={filtered}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    estimatedItemSize={ITEM_HEIGHT}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={true}
                />
            )}
        </View>
    );
};

export default LogList;
