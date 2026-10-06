// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    FlatList,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    queryAIAssistant,
    askKnowledgeBase,
    type AISearchResult,
} from '@screens/channel/ai_actions/ai_api';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    channelId: string;
    teamId: string;
    closeButtonId?: string;
};

type ActiveTab = 'latest' | 'history' | 'active';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    headerButton: {padding: 8},
    headerTitle: {
        ...typography('Heading', 400, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        textAlign: 'center',
        marginRight: 40,
    },
    tabs: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: theme.buttonBg,
    },
    tabText: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    activeTabText: {
        color: theme.buttonBg,
    },
    content: {padding: 16},
    resultCard: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    resultMemory: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    resultMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    searchInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        marginRight: 8,
    },
    searchButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    searchButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    answerContainer: {
        padding: 16,
        backgroundColor: changeOpacity(theme.linkColor, 0.08),
        borderRadius: 8,
        margin: 16,
    },
    answerText: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 48,
    },
    emptyText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 12,
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
}));

const AIAssistantPanel = ({componentId, channelId, teamId, closeButtonId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [activeTab, setActiveTab] = useState<ActiveTab>('latest');
    const [results, setResults] = useState<AISearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [answer, setAnswer] = useState<string | null>(null);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const loadTabData = useCallback(async (tab: ActiveTab) => {
        setLoading(true);
        setAnswer(null);
        try {
            const result = await queryAIAssistant(serverUrl, {
                team_id: teamId,
                mode: tab === 'latest' ? 'channel_latest' : tab === 'history' ? 'channel_history' : 'channel_active',
                channel_id: channelId,
            });
            setResults(result.results || []);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [channelId, serverUrl, teamId]);

    const handleTabChange = useCallback((tab: ActiveTab) => {
        setActiveTab(tab);
        loadTabData(tab);
    }, [loadTabData]);

    const handleSearch = usePreventDoubleTap(useCallback(async () => {
        if (!searchQuery.trim() || searching) {
            return;
        }
        setSearching(true);
        setAnswer(null);
        try {
            const result = await askKnowledgeBase(serverUrl, teamId, searchQuery.trim());
            setAnswer(result.answer || '');
        } catch {
            setAnswer(null);
        } finally {
            setSearching(false);
        }
    }, [searchQuery, searching, serverUrl, teamId]));

    const renderTabs = () => (
        <View style={styles.tabs}>
            <TouchableOpacity
                style={[styles.tab, activeTab === 'latest' && styles.activeTab]}
                onPress={() => handleTabChange('latest')}
            >
                <Text style={[styles.tabText, activeTab === 'latest' && styles.activeTabText]}>
                    {intl.formatMessage({id: 'ai_assistant.tab_latest', defaultMessage: 'Latest Summary'})}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.tab, activeTab === 'history' && styles.activeTab]}
                onPress={() => handleTabChange('history')}
            >
                <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
                    {intl.formatMessage({id: 'ai_assistant.tab_history', defaultMessage: 'History'})}
                </Text>
            </TouchableOpacity>
            <TouchableOpacity
                style={[styles.tab, activeTab === 'active' && styles.activeTab]}
                onPress={() => handleTabChange('active')}
            >
                <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>
                    {intl.formatMessage({id: 'ai_assistant.tab_active', defaultMessage: 'Action Items'})}
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderResults = () => {
        if (loading) {
            return (
                <View style={styles.loadingContainer}>
                    <Loading color={theme.centerChannelColor} size='small'/>
                </View>
            );
        }

        if (results.length === 0) {
            return (
                <View style={styles.emptyState}>
                    <CompassIcon name='robot' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'ai_assistant.empty', defaultMessage: 'No results available'})}
                    </Text>
                </View>
            );
        }

        return (
            <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.content}
                renderItem={({item}) => (
                    <View style={styles.resultCard}>
                        <Text style={styles.resultMemory}>{item.memory}</Text>
                        {item.date && (
                            <Text style={styles.resultMeta}>
                                {item.date}
                                {item.channel_name && ` · ${item.channel_name}`}
                            </Text>
                        )}
                    </View>
                )}
            />
        );
    };

    return (
        <SafeAreaView style={styles.flex} testID='ai_assistant.panel'>
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
                    <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({id: 'channel_header.group_summary', defaultMessage: 'Group Summary'})}
                </Text>
                <View style={{width: 40}}/>
            </View>

            {answer !== null && (
                <View style={styles.answerContainer}>
                    <Text style={styles.answerText}>{answer}</Text>
                </View>
            )}

            {answer === null && (
                <>
                    {renderTabs()}
                    {renderResults()}
                </>
            )}

            <View style={styles.searchContainer}>
                <TextInput
                    style={styles.searchInput}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={intl.formatMessage({id: 'ai_assistant.search_placeholder', defaultMessage: 'Ask AI...'})}
                />
                <TouchableOpacity
                    style={styles.searchButton}
                    onPress={handleSearch}
                    disabled={!searchQuery.trim() || searching}
                >
                    <Text style={styles.searchButtonText}>
                        {searching
                            ? intl.formatMessage({id: 'ai_assistant.searching', defaultMessage: 'Searching...'})
                            : intl.formatMessage({id: 'ai_assistant.search', defaultMessage: 'Ask'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default AIAssistantPanel;
