// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    searchConversationsByPerson,
    type PersonSearchResult,
    type PersonSearchUser,
} from '../home/apps/workbench_api';

type Props = {
    keyword: string;
    close: () => void;
};

const PAGE_SIZE = 20;

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    headerSubtitle: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 4,
    },
    card: {
        padding: 14,
        marginHorizontal: 16,
        marginVertical: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 6,
    },
    cardDate: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.buttonBg,
    },
    cardChannel: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    cardSummary: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        lineHeight: 20,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 64,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.5),
        textAlign: 'center',
        marginTop: 12,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    footerLoading: {
        paddingVertical: 16,
        alignItems: 'center',
    },
}));

const ConversationSearch = ({keyword, close}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [results, setResults] = useState<PersonSearchResult[]>([]);
    const [user, setUser] = useState<PersonSearchUser | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [page, setPage] = useState(0);
    const [error, setError] = useState('');

    const search = useCallback(async (pageNum: number, append = false) => {
        if (pageNum === 0) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }

        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                setError('No team');
                return;
            }

            const resp = await searchConversationsByPerson(serverUrl, teamId, keyword, pageNum, PAGE_SIZE);
            if (resp.ok) {
                if (resp.user) {
                    setUser(resp.user);
                }
                if (append) {
                    setResults((prev) => [...prev, ...(resp.results || [])]);
                } else {
                    setResults(resp.results || []);
                }
                setTotal(resp.total);
                setHasMore(resp.has_more);
                setPage(pageNum);
            } else {
                setError(resp.error || 'Search failed');
            }
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [serverUrl, keyword]);

    useEffect(() => {
        search(0);
    }, [search]);

    const loadMore = useCallback(() => {
        if (!loadingMore && hasMore) {
            search(page + 1, true);
        }
    }, [loadingMore, hasMore, page, search]);

    const renderResult = useCallback(({item}: {item: PersonSearchResult}) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <CompassIcon name='calendar-outline' size={14} color={theme.buttonBg}/>
                <Text style={styles.cardDate}>{item.date}</Text>
                <Text style={styles.cardChannel}>· {item.channel_name}</Text>
            </View>
            <Text style={styles.cardSummary} numberOfLines={4}>
                {item.summary}
            </Text>
        </View>
    ), [styles, theme]);

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size='large' color={theme.buttonBg}/>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.emptyContainer}>
                <CompassIcon name='alert-circle-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                <Text style={styles.emptyText}>{error}</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {user && (
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>
                        {user.nickname || user.username}
                    </Text>
                    <Text style={styles.headerSubtitle}>
                        {intl.formatMessage(
                            {id: 'conversation_search.result_count', defaultMessage: '共 {count} 条聊天记录摘要'},
                            {count: total},
                        )}
                    </Text>
                </View>
            )}
            <FlatList
                data={results}
                keyExtractor={(item, index) => `${item.channel_id}-${item.date}-${index}`}
                renderItem={renderResult}
                onEndReached={loadMore}
                onEndReachedThreshold={0.3}
                contentContainerStyle={results.length === 0 ? {flex: 1} : {paddingBottom: 40}}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <CompassIcon name='magnify' size={48} color={changeOpacity(theme.centerChannelColor, 0.3)}/>
                        <Text style={styles.emptyText}>
                            {intl.formatMessage(
                                {id: 'conversation_search.no_results', defaultMessage: '未找到与「{keyword}」相关的聊天记录'},
                                {keyword},
                            )}
                        </Text>
                    </View>
                }
                ListFooterComponent={loadingMore ? (
                    <View style={styles.footerLoading}>
                        <ActivityIndicator size='small' color={theme.buttonBg}/>
                    </View>
                ) : null}
            />
        </View>
    );
};

export default ConversationSearch;
