// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import Markdown from '@components/markdown';
import {Screens as ScreenConstants} from '@constants';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import {usePreventDoubleTap} from '@hooks/utils';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    queryAIAssistant,
    getQueryResult,
    graduateMemory,
    askKnowledgeBase,
    listConsultations,
    getConsultationResponses,
    type AISearchResult,
    type ConsultationInfo,
    type ConsultationResponse,
} from '@screens/channel/ai_actions/ai_api';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    channelId: string;
    teamId: string;
    closeButtonId?: string;
};

type ActiveTab = 'latest' | 'history' | 'active';

type ConsultationQA = {
    question: string;
    questioner: string;
    target: string;
    date: string;
    responses: Array<{author: string; message: string}>;
};

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
    datePicker: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    datePickerButton: {
        padding: 8,
    },
    datePickerText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginHorizontal: 16,
    },
    graduateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        paddingVertical: 4,
        paddingHorizontal: 8,
        alignSelf: 'flex-end',
    },
    graduateButtonText: {
        ...typography('Body', 50),
        color: theme.linkColor,
        marginLeft: 4,
    },
    graduateButtonDone: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    qaSection: {
        marginTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
        paddingTop: 8,
    },
    qaHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    qaHeaderText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    qaItem: {
        marginTop: 8,
        padding: 10,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
    },
    qaQuestion: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    qaMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    qaResponse: {
        marginTop: 6,
        paddingLeft: 10,
        borderLeftWidth: 2,
        borderLeftColor: changeOpacity(theme.linkColor, 0.4),
    },
    qaResponseAuthor: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
    },
    qaResponseText: {
        ...typography('Body', 75),
        color: theme.centerChannelColor,
        marginTop: 2,
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
    const [searchEntries, setSearchEntries] = useState<Array<{query: string; answer: string}>>([]);
    const [expandedQA, setExpandedQA] = useState(false);
    const [consultationQA, setConsultationQA] = useState<ConsultationQA[]>([]);
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [graduatedPaths, setGraduatedPaths] = useState<Set<string>>(new Set());

    // Fetch consultations for this channel
    useEffect(() => {
        (async () => {
            try {
                const result = await listConsultations(serverUrl, channelId);
                const consultations = result.consultations || [];
                const qaList: ConsultationQA[] = [];
                for (const c of consultations) {
                    try {
                        const resp = await getConsultationResponses(serverUrl, c.id);
                        const responses = (resp.responses || [])
                            .filter((r: ConsultationResponse) => !r.is_requester)
                            .map((r: ConsultationResponse) => ({author: r.author_name, message: r.message}));
                        if (responses.length > 0) {
                            qaList.push({
                                question: c.question,
                                questioner: c.target_display_name || c.target_username,
                                target: c.target_display_name || c.target_username,
                                date: c.created_at ? new Date(c.created_at).toISOString().split('T')[0] : '',
                                responses,
                            });
                        }
                    } catch {
                        // skip failed consultation
                    }
                }
                setConsultationQA(qaList);
            } catch {
                setConsultationQA([]);
            }
        })();
    }, [serverUrl, channelId]);

    const handleClose = useCallback(() => {
        dismissModal({componentId});
    }, [componentId]);

    const loadTabData = useCallback(async (tab: ActiveTab, date?: string) => {
        setLoading(true);
        setSearchEntries([]);
        try {
            const mode = tab === 'latest' ? 'channel_latest' : tab === 'history' ? 'channel_history' : 'channel_active';
            const params: any = {
                team_id: teamId,
                mode,
                channel_id: channelId,
            };
            if (date) {
                params.date = date;
            }
            const result = await queryAIAssistant(serverUrl, params);

            // If response has query_id, poll for async result
            if (result.query_id) {
                let pollResults: AISearchResult[] = [];
                for (let i = 0; i < 30; i++) {
                    await new Promise((r) => setTimeout(r, 1000));
                    const pollResult = await getQueryResult(serverUrl, result.query_id);
                    if (pollResult.status === 'complete') {
                        pollResults = pollResult.results || [];
                        break;
                    }
                }
                setResults(pollResults);
            } else {
                setResults(result.results || []);
            }
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [channelId, serverUrl, teamId]);

    const handleTabChange = useCallback((tab: ActiveTab) => {
        setActiveTab(tab);
        if (tab === 'history') {
            loadTabData(tab, selectedDate);
        } else {
            loadTabData(tab);
        }
    }, [loadTabData, selectedDate]);

    // Auto-load latest summary on mount
    useEffect(() => {
        loadTabData('latest');
    }, []);

    // Date navigation helpers
    const shiftDate = useCallback((days: number) => {
        const d = new Date(selectedDate);
        d.setDate(d.getDate() + days);
        const newDate = d.toISOString().split('T')[0];
        setSelectedDate(newDate);
        loadTabData('history', newDate);
    }, [selectedDate, loadTabData]);

    const handleGraduate = useCallback(async (memoryPath: string) => {
        if (!memoryPath || graduatedPaths.has(memoryPath)) {
            return;
        }
        try {
            await graduateMemory(serverUrl, teamId, memoryPath);
            setGraduatedPaths((prev) => new Set(prev).add(memoryPath));
        } catch {
            // ignore
        }
    }, [serverUrl, teamId, graduatedPaths]);

    const toggleQA = useCallback(() => {
        setExpandedQA((prev) => !prev);
    }, []);

    const handleSearch = usePreventDoubleTap(useCallback(async () => {
        if (!searchQuery.trim() || searching) {
            return;
        }
        const query = searchQuery.trim();
        setSearchQuery('');
        setSearching(true);
        setSearchEntries((prev) => [...prev, {query, answer: ''}]);
        try {
            const resp = await askKnowledgeBase(serverUrl, teamId, query);
            const answerText = resp?.data?.answer || resp?.answer || '';
            setSearchEntries((prev) => {
                const next = [...prev];
                next[next.length - 1] = {query, answer: answerText};
                return next;
            });
        } catch (error) {
            setSearchEntries((prev) => {
                const next = [...prev];
                next[next.length - 1] = {query, answer: intl.formatMessage({id: 'ai_assistant.search_error', defaultMessage: 'Failed to get an answer. Please try again.'})};
                return next;
            });
        } finally {
            setSearching(false);
        }
    }, [searchQuery, searching, serverUrl, teamId, intl]));

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
                    {intl.formatMessage({id: 'ai_assistant.tab_todo', defaultMessage: 'Todo'})}
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
            const emptyMessages: Record<ActiveTab, {icon: string; text: string; id: string}> = {
                latest: {
                    icon: 'star-outline',
                    text: intl.formatMessage({id: 'ai_assistant.empty_latest', defaultMessage: 'No summary yet. When enough messages accumulate, the system will automatically generate a summary.'}),
                    id: 'ai_assistant.empty_latest',
                },
                history: {
                    icon: 'calendar-outline',
                    text: intl.formatMessage({id: 'ai_assistant.empty_history', defaultMessage: 'No summary for this date.'}),
                    id: 'ai_assistant.empty_history',
                },
                active: {
                    icon: 'checkbox-marked-circle-outline',
                    text: intl.formatMessage({id: 'ai_assistant.empty_todo', defaultMessage: 'No todo items.'}),
                    id: 'ai_assistant.empty_todo',
                },
            };
            const msg = emptyMessages[activeTab];
            return (
                <View style={styles.emptyState}>
                    <CompassIcon name={msg.icon} size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>{msg.text}</Text>
                </View>
            );
        }

        // Latest tab: show first result as full summary (Webapp behavior)
        if (activeTab === 'latest' && results.length > 0 && results[0]) {
            const summary = results[0];
            return (
                <FlatList
                    data={[summary]}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.content}
                    renderItem={({item}) => (
                        <View style={styles.resultCard}>
                            <Markdown
                                baseTextStyle={styles.resultMemory}
                                enableLatex={false}
                                enableInlineLatex={false}
                                location={ScreenConstants.AI_ASSISTANT_PANEL}
                                maxNodes={5000}
                                theme={theme}
                                value={item.memory}
                            />
                            {item.date && (
                                <Text style={styles.resultMeta}>
                                    {item.date}
                                    {item.channel_name && ` · ${item.channel_name}`}
                                </Text>
                            )}
                        </View>
                    )}
                    ListFooterComponent={
                        <View>
                            {consultationQA.length > 0 && (
                                <View style={[styles.resultCard, {marginTop: 0}]}>
                                    <TouchableOpacity
                                        style={styles.qaHeader}
                                        onPress={toggleQA}
                                        activeOpacity={0.7}
                                    >
                                        <Text style={styles.qaHeaderText}>
                                            {'💬 ' + intl.formatMessage(
                                                {id: 'ai_assistant.consultation_qa', defaultMessage: 'Consultation Q&A ({count})'},
                                                {count: consultationQA.length},
                                            )}
                                        </Text>
                                        <CompassIcon
                                            name={expandedQA ? 'menu-up' : 'menu-down'}
                                            size={20}
                                            color={theme.centerChannelColor}
                                        />
                                    </TouchableOpacity>
                                    {expandedQA && consultationQA.map((qa, idx) => (
                                        <View key={idx} style={styles.qaItem}>
                                            <Text style={styles.qaQuestion}>
                                                {'❓ ' + qa.question}
                                            </Text>
                                            <Text style={styles.qaMeta}>
                                                {qa.target || ''}
                                                {qa.date ? ` · ${qa.date}` : ''}
                                            </Text>
                                            {qa.responses?.map((resp, rIdx) => (
                                                <View key={rIdx} style={styles.qaResponse}>
                                                    <Text style={styles.qaResponseAuthor}>{resp.author}</Text>
                                                    <Text style={styles.qaResponseText}>{resp.message}</Text>
                                                </View>
                                            ))}
                                        </View>
                                    ))}
                                </View>
                            )}
                            {searchEntries.map((entry, i) => (
                                <View key={i} style={[styles.resultCard, {marginTop: 0}]}>
                                    <View style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}>
                                        <Text>{'🔍 '}</Text>
                                        <Text style={[styles.resultMemory, {marginBottom: 0}]}>{entry.query}</Text>
                                    </View>
                                    {entry.answer ? (
                                        <View>
                                            <Text style={[styles.qaHeaderText, {marginBottom: 4}]}>
                                                {'🤖 ' + intl.formatMessage({id: 'ai_assistant.reasoned_answer', defaultMessage: 'AI Answer'})}
                                            </Text>
                                            <Markdown
                                                baseTextStyle={styles.resultMemory}
                                                enableLatex={false}
                                                enableInlineLatex={false}
                                                location={ScreenConstants.AI_ASSISTANT_PANEL}
                                                maxNodes={5000}
                                                theme={theme}
                                                value={entry.answer}
                                            />
                                        </View>
                                    ) : searching && i === searchEntries.length - 1 ? (
                                        <Text style={styles.resultMeta}>
                                            {intl.formatMessage({id: 'ai_assistant.searching', defaultMessage: 'Searching...'})}
                                        </Text>
                                    ) : null}
                                </View>
                            ))}
                        </View>
                    }
                    }}
                />
            );
        }

        // History tab: date picker + list with graduate buttons
        const showDatePicker = activeTab === 'history';
        const showGraduate = activeTab === 'history' || activeTab === 'active';

        return (
            <FlatList
                data={results}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.content}
                ListHeaderComponent={showDatePicker ? (
                    <View style={styles.datePicker}>
                        <TouchableOpacity style={styles.datePickerButton} onPress={() => shiftDate(-1)}>
                            <CompassIcon name='chevron-left' size={20} color={theme.centerChannelColor}/>
                        </TouchableOpacity>
                        <Text style={styles.datePickerText}>{selectedDate}</Text>
                        <TouchableOpacity style={styles.datePickerButton} onPress={() => shiftDate(1)}>
                            <CompassIcon name='chevron-right' size={20} color={theme.centerChannelColor}/>
                        </TouchableOpacity>
                    </View>
                ) : undefined}
                renderItem={({item}) => {
                    const isGraduated = graduatedPaths.has(item.path || '');
                    return (
                        <View style={styles.resultCard}>
                            <Markdown
                                baseTextStyle={styles.resultMemory}
                                enableLatex={false}
                                enableInlineLatex={false}
                                location={ScreenConstants.AI_ASSISTANT_PANEL}
                                maxNodes={5000}
                                theme={theme}
                                value={item.memory}
                            />
                            {item.date && (
                                <Text style={styles.resultMeta}>
                                    {item.date}
                                    {item.channel_name && ` · ${item.channel_name}`}
                                </Text>
                            )}
                            {showGraduate && item.path && (
                                <TouchableOpacity
                                    style={styles.graduateButton}
                                    onPress={() => handleGraduate(item.path!)}
                                    disabled={isGraduated}
                                >
                                    <CompassIcon
                                        name={isGraduated ? 'check' : 'book-outline'}
                                        size={14}
                                        color={isGraduated ? changeOpacity(theme.centerChannelColor, 0.56) : theme.linkColor}
                                    />
                                    <Text style={[styles.graduateButtonText, isGraduated && styles.graduateButtonDone]}>
                                        {isGraduated
                                            ? intl.formatMessage({id: 'ai_assistant.graduated', defaultMessage: 'Archived'})
                                            : intl.formatMessage({id: 'ai_assistant.graduate', defaultMessage: 'Archive to KB'})}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                }}
            />
        );
    };

    return (
        <SafeAreaView style={styles.flex} testID='ai_assistant.panel'>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
            >
                <View style={styles.header}>
                    <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
                        <CompassIcon name='close' size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>
                        {intl.formatMessage({id: 'channel_header.group_summary', defaultMessage: 'Group Summary'})}
                    </Text>
                    <View style={{width: 40}}/>
                </View>

            {renderTabs()}

            <View style={styles.flex}>
                {renderResults()}
            </View>

            {/* Search bar: only in latest tab, below content */}
            {activeTab === 'latest' && (
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
            )}
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

export default AIAssistantPanel;
