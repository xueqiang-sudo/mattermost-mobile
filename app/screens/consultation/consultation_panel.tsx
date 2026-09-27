// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    FlatList,
    Keyboard,
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
    createConsultation,
    listConsultations,
    getConsultationResponses,
    replyToConsultation,
    type ConsultationInfo,
    type ConsultationResponse,
} from '@screens/channel/ai_actions/ai_api';

import type {AvailableScreens} from '@typings/screens/navigation';

type Props = {
    componentId: AvailableScreens;
    channelId: string;
    teamId?: string;
    closeButtonId?: string;
};

type ActiveView = 'list' | 'detail' | 'compose';

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
    listContent: {padding: 16},
    card: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 8,
        padding: 12,
        marginBottom: 12,
    },
    cardQuestion: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        marginBottom: 4,
    },
    cardMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    cardStatus: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.linkColor,
        marginTop: 4,
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
    composeContainer: {padding: 16},
    composeLabel: {
        ...typography('Body', 75, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 8,
    },
    composeInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        padding: 12,
        minHeight: 120,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
        textAlignVertical: 'top',
        marginBottom: 16,
    },
    composeButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
    },
    composeButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 200, 'SemiBold'),
    },
    detailContainer: {padding: 16},
    responseItem: {
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    responseAuthor: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.linkColor,
    },
    responseMessage: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
        marginTop: 2,
    },
    replyContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    replyInput: {
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
    replyButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    replyButtonText: {
        color: theme.buttonColor,
        ...typography('Body', 100, 'SemiBold'),
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
}));

const ConsultationPanel = ({componentId, channelId, teamId, closeButtonId}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const styles = getStyleSheet(theme);

    const [activeView, setActiveView] = useState<ActiveView>('list');
    const [consultations, setConsultations] = useState<ConsultationInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [composeQuestion, setComposeQuestion] = useState('');
    const [composing, setComposing] = useState(false);
    const [selectedConsultation, setSelectedConsultation] = useState<ConsultationInfo | null>(null);
    const [responses, setResponses] = useState<ConsultationResponse[]>([]);
    const [loadingResponses, setLoadingResponses] = useState(false);
    const [replyText, setReplyText] = useState('');

    const handleClose = useCallback(() => {
        if (closeButtonId) {
            dismissModal({componentId});
        } else {
            dismissModal({componentId});
        }
    }, [closeButtonId, componentId]);

    const loadConsultations = useCallback(async () => {
        setLoading(true);
        try {
            const result = await listConsultations(serverUrl, channelId);
            setConsultations(result.consultations || []);
        } catch {
            setConsultations([]);
        } finally {
            setLoading(false);
        }
    }, [channelId, serverUrl]);

    useEffect(() => {
        loadConsultations();
    }, [loadConsultations]);

    const handleCompose = usePreventDoubleTap(useCallback(async () => {
        if (!composeQuestion.trim() || composing) {
            return;
        }
        setComposing(true);
        try {
            await createConsultation(serverUrl, {
                source_channel_id: channelId,
                team_id: teamId,
                question: composeQuestion.trim(),
            });
            setComposeQuestion('');
            setActiveView('list');
            await loadConsultations();
        } catch {
            // ignore
        } finally {
            setComposing(false);
        }
    }, [channelId, composeQuestion, composing, loadConsultations, serverUrl, teamId]));

    const handleSelectConsultation = useCallback(async (c: ConsultationInfo) => {
        setSelectedConsultation(c);
        setActiveView('detail');
        setLoadingResponses(true);
        try {
            const result = await getConsultationResponses(serverUrl, c.id);
            setResponses(result.responses || []);
        } catch {
            setResponses([]);
        } finally {
            setLoadingResponses(false);
        }
    }, [serverUrl]);

    const handleReply = usePreventDoubleTap(useCallback(async () => {
        if (!replyText.trim() || !selectedConsultation) {
            return;
        }
        try {
            await replyToConsultation(serverUrl, selectedConsultation.id, replyText.trim());
            setReplyText('');
            const result = await getConsultationResponses(serverUrl, selectedConsultation.id);
            setResponses(result.responses || []);
        } catch {
            // ignore
        }
    }, [replyText, selectedConsultation, serverUrl]));

    const renderList = () => {
        if (loading) {
            return (
                <View style={styles.loadingContainer}>
                    <Loading color={theme.centerChannelColor} size='small'/>
                </View>
            );
        }

        if (consultations.length === 0) {
            return (
                <View style={styles.emptyState}>
                    <CompassIcon name='account-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'consultation.empty', defaultMessage: 'No consultations yet. Tap + to create one.'})}
                    </Text>
                </View>
            );
        }

        return (
            <FlatList
                data={consultations}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({item}) => (
                    <TouchableOpacity
                        style={styles.card}
                        onPress={() => handleSelectConsultation(item)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.cardQuestion} numberOfLines={2}>{item.question}</Text>
                        <Text style={styles.cardMeta}>
                            {item.target_display_name || item.target_username}
                            {' · '}
                            {new Date(item.created_at).toLocaleDateString()}
                        </Text>
                        <Text style={styles.cardStatus}>{item.status}</Text>
                    </TouchableOpacity>
                )}
            />
        );
    };

    const renderCompose = () => (
        <View style={styles.composeContainer}>
            <Text style={styles.composeLabel}>
                {intl.formatMessage({id: 'consultation.question_label', defaultMessage: 'Your question'})}
            </Text>
            <TextInput
                style={styles.composeInput}
                value={composeQuestion}
                onChangeText={setComposeQuestion}
                placeholder={intl.formatMessage({id: 'consultation.question_placeholder', defaultMessage: 'Describe your question...'})}
                multiline={true}
                textAlignVertical='top'
            />
            <TouchableOpacity
                style={[styles.composeButton, !composeQuestion.trim() && {opacity: 0.5}]}
                onPress={handleCompose}
                disabled={!composeQuestion.trim() || composing}
            >
                <Text style={styles.composeButtonText}>
                    {composing
                        ? intl.formatMessage({id: 'consultation.submitting', defaultMessage: 'Submitting...'})
                        : intl.formatMessage({id: 'consultation.submit', defaultMessage: 'Submit Consultation'})}
                </Text>
            </TouchableOpacity>
        </View>
    );

    const renderDetail = () => (
        <View style={styles.flex}>
            <FlatList
                data={responses}
                keyExtractor={(item) => item.post_id}
                contentContainerStyle={styles.detailContainer}
                ListHeaderComponent={
                    <View style={styles.card}>
                        <Text style={styles.cardQuestion}>{selectedConsultation?.question}</Text>
                        <Text style={styles.cardMeta}>{selectedConsultation?.status}</Text>
                    </View>
                }
                renderItem={({item}) => (
                    <View style={styles.responseItem}>
                        <Text style={styles.responseAuthor}>{item.author_name}</Text>
                        <Text style={styles.responseMessage}>{item.message}</Text>
                    </View>
                )}
                ListEmptyComponent={
                    loadingResponses ? (
                        <View style={styles.loadingContainer}>
                            <Loading color={theme.centerChannelColor} size='small'/>
                        </View>
                    ) : (
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({id: 'consultation.no_responses', defaultMessage: 'No responses yet'})}
                        </Text>
                    )
                }
            />
            <View style={styles.replyContainer}>
                <TextInput
                    style={styles.replyInput}
                    value={replyText}
                    onChangeText={setReplyText}
                    placeholder={intl.formatMessage({id: 'consultation.reply_placeholder', defaultMessage: 'Type a reply...'})}
                />
                <TouchableOpacity
                    style={styles.replyButton}
                    onPress={handleReply}
                    disabled={!replyText.trim()}
                >
                    <Text style={styles.replyButtonText}>
                        {intl.formatMessage({id: 'consultation.send', defaultMessage: 'Send'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const headerTitle = activeView === 'compose'
        ? intl.formatMessage({id: 'consultation.compose_title', defaultMessage: 'New Consultation'})
        : activeView === 'detail'
            ? intl.formatMessage({id: 'consultation.detail_title', defaultMessage: 'Consultation Detail'})
            : intl.formatMessage({id: 'consultation.title', defaultMessage: 'Consult Expert'});

    return (
        <SafeAreaView style={styles.flex} testID='consultation.panel'>
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerButton} onPress={() => activeView === 'list' ? handleClose() : setActiveView('list')}>
                    <CompassIcon
                        name={activeView === 'list' ? 'close' : 'arrow-left'}
                        size={24}
                        color={theme.centerChannelColor}
                    />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{headerTitle}</Text>
                {activeView === 'list' && (
                    <TouchableOpacity
                        style={styles.headerButton}
                        onPress={() => {
                            Keyboard.dismiss();
                            setActiveView('compose');
                        }}
                    >
                        <CompassIcon name='plus' size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                )}
                {activeView !== 'list' && <View style={{width: 40}}/>}
            </View>
            {activeView === 'list' && renderList()}
            {activeView === 'compose' && renderCompose()}
            {activeView === 'detail' && renderDetail()}
        </SafeAreaView>
    );
};

export default ConsultationPanel;
