// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    DeviceEventEmitter,
    FlatList,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useDatabase} from '@nozbe/watermelondb/react';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import ProfilePicture from '@components/profile_picture';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {queryAllChannelsForTeam} from '@queries/servers/channel';
import {getCurrentUserId} from '@queries/servers/system';
import {queryAllUsers} from '@queries/servers/user';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    createConsultation,
    listConsultations,
    getConsultationResponses,
    replyToConsultation,
    forwardResponseToCustomer,
    closeConsultation,
    type ConsultationInfo,
    type ConsultationResponse,
} from '@screens/channel/ai_actions/ai_api';

import type {AvailableScreens} from '@typings/screens/navigation';
import type UserModel from '@typings/database/models/servers/user';
import type ChannelModel from '@typings/database/models/servers/channel';

type Props = {
    componentId: AvailableScreens;
    channelId: string;
    teamId?: string;
    closeButtonId?: string;
    prefillText?: string;
};

type TargetType = 'member' | 'group';
type ActiveView = 'compose' | 'detail';

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    flex: {flex: 1},
    tabs: {
        flexDirection: 'row',
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
    searchContainer: {
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    searchInput: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    searchText: {
        flex: 1,
        marginLeft: 8,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    selectedItem: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    itemInfo: {
        flex: 1,
        marginLeft: 12,
    },
    itemName: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    itemMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    checkmark: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkmarkSelected: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    groupAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 32,
    },
    emptyText: {
        ...typography('Body', 100),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 8,
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
        backgroundColor: theme.centerChannelBg,
    },
    inputField: {
        flex: 1,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        maxHeight: 100,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    sendButton: {
        marginLeft: 8,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: theme.buttonBg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        opacity: 0.4,
    },

    // Detail view styles
    detailHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    detailHeaderButton: {padding: 8},
    detailTitle: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
        marginLeft: 4,
    },
    detailContainer: {padding: 16},
    messageBubble: {
        maxWidth: '80%',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
    },
    messageBubbleOwn: {
        alignSelf: 'flex-end',
        backgroundColor: theme.buttonBg,
    },
    messageBubbleOther: {
        alignSelf: 'flex-start',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    messageAuthor: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.64),
        marginBottom: 4,
    },
    messageText: {
        ...typography('Body', 100),
        color: theme.centerChannelColor,
    },
    messageTextOwn: {
        color: theme.buttonColor,
    },
    messageActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 4,
    },
    forwardButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    forwardButtonText: {
        ...typography('Body', 50),
        color: theme.linkColor,
        marginLeft: 4,
    },
    replyInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 8,
        maxHeight: 100,
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    loadingContainer: {
        paddingVertical: 24,
        alignItems: 'center',
    },
    historySection: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 4,
    },
    historyTitle: {
        ...typography('Body', 50, 'SemiBold'),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        textTransform: 'uppercase',
    },
    historyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    historyCardText: {
        flex: 1,
    },
    historyQuestion: {
        ...typography('Body', 200),
        color: theme.centerChannelColor,
    },
    historyMeta: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginTop: 2,
    },
    historyStatus: {
        ...typography('Body', 50, 'SemiBold'),
        color: theme.linkColor,
    },
    selectButton: {
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    selectButtonText: {
        ...typography('Body', 75),
        color: theme.buttonBg,
    },
    forwardToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
        borderTopWidth: 1,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    forwardToolbarText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    forwardToolbarButton: {
        backgroundColor: theme.buttonBg,
        borderRadius: 8,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    forwardToolbarButtonText: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.buttonColor,
    },
    responseCheckbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.32),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 8,
    },
    responseCheckboxSelected: {
        backgroundColor: theme.buttonBg,
        borderColor: theme.buttonBg,
    },
    responseRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    responseBubbleWrapper: {
        flex: 1,
    },
}));

const ConsultationPanel = ({componentId, channelId, teamId, prefillText}: Props) => {
    const theme = useTheme();
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const database = useDatabase();
    const styles = getStyleSheet(theme);

    const [currentUserId, setCurrentUserId] = useState('');
    const [activeView, setActiveView] = useState<ActiveView>(prefillText ? 'compose' : 'compose');
    const [activeTab, setActiveTab] = useState<TargetType>('member');
    const [searchQuery, setSearchQuery] = useState('');
    const [users, setUsers] = useState<UserModel[]>([]);
    const [channels, setChannels] = useState<ChannelModel[]>([]);

    // Compose state
    const [selectedTargetId, setSelectedTargetId] = useState('');
    const [selectedTargetName, setSelectedTargetName] = useState('');
    const [isGroupTarget, setIsGroupTarget] = useState(false);
    const [questionText, setQuestionText] = useState(prefillText || '');
    const [submitting, setSubmitting] = useState(false);

    // Detail/follow-up state
    const [selectedConsultation, setSelectedConsultation] = useState<ConsultationInfo | null>(null);
    const [responses, setResponses] = useState<ConsultationResponse[]>([]);
    const [loadingResponses, setLoadingResponses] = useState(false);
    const [replyText, setReplyText] = useState('');
    const [consultations, setConsultations] = useState<ConsultationInfo[]>([]);
    const [selectMode, setSelectMode] = useState(false);
    const [selectedResponseIds, setSelectedResponseIds] = useState<Set<string>>(new Set());
    const [forwarding, setForwarding] = useState(false);

    // Load current user ID
    useEffect(() => {
        (async () => {
            const uid = await getCurrentUserId(database);
            setCurrentUserId(uid);
        })();
    }, [database]);

    // Load users via observable
    useEffect(() => {
        const sub = queryAllUsers(database).observe().subscribe((u) => {
            setUsers(u.filter((user) => user.id !== currentUserId));
        });
        return () => sub.unsubscribe();
    }, [database, currentUserId]);

    // Load channels via observable
    useEffect(() => {
        if (!teamId) {
            return;
        }
        const sub = queryAllChannelsForTeam(database, teamId).observe().subscribe((c) => {
            setChannels(c.filter((ch) => ch.type === 'G'));
        });
        return () => sub.unsubscribe();
    }, [database, teamId]);

    // Load existing consultations
    useEffect(() => {
        listConsultations(serverUrl, channelId).then((result) => {
            setConsultations(result.consultations || []);
        }).catch(() => {
            setConsultations([]);
        });
    }, [channelId, serverUrl]);

    // WebSocket real-time updates
    useEffect(() => {
        const subscription = DeviceEventEmitter.addListener(
            'consultation_response',
            (data: any) => {
                if (data.consultationId === selectedConsultation?.id) {
                    setResponses((prev) => {
                        if (prev.some((r) => r.post_id === data.response.post_id)) {
                            return prev;
                        }
                        return [...prev, data.response];
                    });
                }
            },
        );
        return () => subscription.remove();
    }, [selectedConsultation]);

    // Filter list based on tab and search
    const filteredList = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();

        if (activeTab === 'member') {
            const list = users;
            if (!query) {
                return list;
            }
            return list.filter((u) => {
                const name = (u.firstName + ' ' + u.lastName).toLowerCase();
                const username = u.username.toLowerCase();
                const position = (u.position || '').toLowerCase();
                return name.includes(query) || username.includes(query) || position.includes(query);
            });
        } else {
            const list = channels;
            if (!query) {
                return list;
            }
            return list.filter((c) => {
                const name = (c.displayName || c.name || '').toLowerCase();
                return name.includes(query);
            });
        }
    }, [searchQuery, activeTab, users, channels]);

    const handleClose = useCallback(() => {
        if (selectedConsultation && selectedConsultation.status !== 'closed') {
            closeConsultation(serverUrl, selectedConsultation.id).catch(() => {});
        }
        dismissModal({componentId});
    }, [componentId, selectedConsultation, serverUrl]);

    useNavButtonPressed('close-consultation-panel', componentId, handleClose, [handleClose]);

    const handleSelectTarget = useCallback((item: UserModel | ChannelModel) => {
        if (activeTab === 'member') {
            const user = item as UserModel;
            const name = `${user.firstName} ${user.lastName}`.trim() || user.username;
            setSelectedTargetId(user.id);
            setSelectedTargetName(name);
            setIsGroupTarget(false);
        } else {
            const channel = item as ChannelModel;
            const name = channel.displayName || channel.name || '';
            setSelectedTargetId(channel.id);
            setSelectedTargetName(name);
            setIsGroupTarget(true);
        }
    }, [activeTab]);

    const handleSend = usePreventDoubleTap(useCallback(async () => {
        if (!questionText.trim() || !selectedTargetId || submitting) {
            return;
        }
        setSubmitting(true);
        try {
            await createConsultation(serverUrl, {
                source_channel_id: channelId,
                team_id: teamId,
                target_user_id: isGroupTarget ? undefined : selectedTargetId,
                expert_group_id: isGroupTarget ? selectedTargetId : undefined,
                question: questionText.trim(),
            });
            setQuestionText('');
            setSelectedTargetId('');
            setSelectedTargetName('');
            // Reload consultations
            const result = await listConsultations(serverUrl, channelId);
            setConsultations(result.consultations || []);
            Alert.alert(
                intl.formatMessage({id: 'consultation.submit_success', defaultMessage: 'Success'}),
                intl.formatMessage({id: 'consultation.submit_success_message', defaultMessage: 'Consultation sent successfully.'}),
            );
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'consultation.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'consultation.submit_failed', defaultMessage: 'Failed to send consultation.'}),
            );
        } finally {
            setSubmitting(false);
        }
    }, [channelId, isGroupTarget, questionText, selectedTargetId, serverUrl, submitting, teamId, intl]));

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

    const handleForward = usePreventDoubleTap(useCallback(async (response: ConsultationResponse) => {
        if (!selectedConsultation) {
            return;
        }
        try {
            await forwardResponseToCustomer(serverUrl, selectedConsultation.id, response.post_id);
            setResponses((prev) =>
                prev.map((r) =>
                    r.post_id === response.post_id ? {...r, forwarded: true} : r,
                ),
            );
            Alert.alert(
                intl.formatMessage({id: 'consultation.forward_success', defaultMessage: 'Success'}),
                intl.formatMessage({id: 'consultation.forward_success_message', defaultMessage: 'Response forwarded to customer.'}),
            );
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'consultation.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'consultation.forward_failed', defaultMessage: 'Failed to forward response.'}),
            );
        }
    }, [selectedConsultation, serverUrl, intl]));

    const toggleResponseSelection = useCallback((postId: string) => {
        setSelectedResponseIds((prev) => {
            const next = new Set(prev);
            if (next.has(postId)) {
                next.delete(postId);
            } else {
                next.add(postId);
            }
            return next;
        });
    }, []);

    const handleBatchForward = usePreventDoubleTap(useCallback(async () => {
        if (!selectedConsultation || selectedResponseIds.size === 0 || forwarding) {
            return;
        }
        setForwarding(true);
        try {
            const ids = Array.from(selectedResponseIds);
            for (const postId of ids) {
                await forwardResponseToCustomer(serverUrl, selectedConsultation.id, postId);
            }
            setResponses((prev) =>
                prev.map((r) =>
                    selectedResponseIds.has(r.post_id) ? {...r, forwarded: true} : r,
                ),
            );
            setSelectedResponseIds(new Set());
            setSelectMode(false);
            Alert.alert(
                intl.formatMessage({id: 'consultation.forward_success', defaultMessage: 'Success'}),
                intl.formatMessage(
                    {id: 'consultation.forward_batch_success', defaultMessage: '{count} response(s) forwarded to customer.'},
                    {count: ids.length},
                ),
            );
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'consultation.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'consultation.forward_failed', defaultMessage: 'Failed to forward response.'}),
            );
        } finally {
            setForwarding(false);
        }
    }, [selectedConsultation, selectedResponseIds, forwarding, serverUrl, intl]));

    const canSend = questionText.trim().length > 0 && selectedTargetId.length > 0 && !submitting;

    // ── Detail view (thread) ──
    if (activeView === 'detail' && selectedConsultation) {
        const isOpen = selectedConsultation.status !== 'closed';
        const hasUnforwardedExpertResponses = responses.some((r) => !r.is_requester && !r.forwarded);

        return (
            <SafeAreaView style={styles.flex} testID='consultation.panel'>
                <View style={styles.detailHeader}>
                    <TouchableOpacity
                        style={styles.detailHeaderButton}
                        onPress={() => {
                            setActiveView('compose');
                            setSelectMode(false);
                            setSelectedResponseIds(new Set());
                        }}
                    >
                        <CompassIcon name='arrow-left' size={24} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                    <Text style={styles.detailTitle} numberOfLines={1}>
                        {selectedConsultation.target_display_name || selectedConsultation.target_username}
                    </Text>
                    {isOpen && hasUnforwardedExpertResponses && !selectMode && (
                        <TouchableOpacity
                            style={styles.selectButton}
                            onPress={() => setSelectMode(true)}
                        >
                            <Text style={styles.selectButtonText}>
                                {intl.formatMessage({id: 'consultation.select', defaultMessage: 'Select'})}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {selectMode && (
                        <TouchableOpacity
                            style={styles.selectButton}
                            onPress={() => {
                                setSelectMode(false);
                                setSelectedResponseIds(new Set());
                            }}
                        >
                            <Text style={styles.selectButtonText}>
                                {intl.formatMessage({id: 'consultation.cancel', defaultMessage: 'Cancel'})}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                <FlatList
                    data={responses}
                    keyExtractor={(item) => item.post_id}
                    contentContainerStyle={styles.detailContainer}
                    ListHeaderComponent={
                        <View style={[styles.messageBubble, styles.messageBubbleOwn]}>
                            <Text style={[styles.messageText, styles.messageTextOwn]}>
                                {selectedConsultation.question}
                            </Text>
                        </View>
                    }
                    renderItem={({item}) => {
                        const isOwn = item.is_requester;
                        const isExpertResponse = !isOwn;
                        const canSelect = selectMode && isExpertResponse && !item.forwarded;
                        const isCheckboxSelected = selectedResponseIds.has(item.post_id);

                        const bubble = (
                            <View style={[styles.messageBubble, isOwn ? styles.messageBubbleOwn : styles.messageBubbleOther]}>
                                {!isOwn && (
                                    <Text style={styles.messageAuthor}>{item.author_name}</Text>
                                )}
                                <Text style={[styles.messageText, isOwn && styles.messageTextOwn]}>
                                    {item.message}
                                </Text>
                                {!selectMode && !isOwn && !item.forwarded && isOpen && (
                                    <View style={styles.messageActions}>
                                        <TouchableOpacity
                                            style={styles.forwardButton}
                                            onPress={() => handleForward(item)}
                                        >
                                            <CompassIcon name='share-variant' size={14} color={theme.linkColor}/>
                                            <Text style={styles.forwardButtonText}>
                                                {intl.formatMessage({id: 'consultation.forward_to_customer', defaultMessage: 'Forward'})}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                                {!isOwn && item.forwarded && (
                                    <View style={styles.messageActions}>
                                        <CompassIcon name='check' size={14} color={theme.linkColor}/>
                                        <Text style={styles.forwardButtonText}>
                                            {intl.formatMessage({id: 'consultation.forwarded', defaultMessage: 'Forwarded'})}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        );

                        if (selectMode && isExpertResponse && !item.forwarded) {
                            return (
                                <TouchableOpacity
                                    style={styles.responseRow}
                                    onPress={() => canSelect && toggleResponseSelection(item.post_id)}
                                    activeOpacity={0.7}
                                >
                                    <View style={[styles.responseCheckbox, isCheckboxSelected && styles.responseCheckboxSelected]}>
                                        {isCheckboxSelected && <CompassIcon name='check' size={14} color='#fff'/>}
                                    </View>
                                    <View style={styles.responseBubbleWrapper}>
                                        {bubble}
                                    </View>
                                </TouchableOpacity>
                            );
                        }

                        return bubble;
                    }}
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
                {selectMode && (
                    <View style={styles.forwardToolbar}>
                        <Text style={styles.forwardToolbarText}>
                            {intl.formatMessage(
                                {id: 'consultation.selected_count', defaultMessage: '{count} selected'},
                                {count: selectedResponseIds.size},
                            )}
                        </Text>
                        <TouchableOpacity
                            style={[styles.forwardToolbarButton, selectedResponseIds.size === 0 && {opacity: 0.4}]}
                            onPress={handleBatchForward}
                            disabled={selectedResponseIds.size === 0 || forwarding}
                        >
                            <Text style={styles.forwardToolbarButtonText}>
                                {forwarding
                                    ? intl.formatMessage({id: 'consultation.forwarding', defaultMessage: 'Forwarding...'})
                                    : intl.formatMessage({id: 'consultation.forward_selected', defaultMessage: 'Forward to customer'})}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}
                {!selectMode && isOpen && (
                    <View style={styles.inputBar}>
                        <TextInput
                            style={styles.replyInput}
                            value={replyText}
                            onChangeText={setReplyText}
                            placeholder={intl.formatMessage({id: 'consultation.followup_placeholder', defaultMessage: 'Type your follow-up...'})}
                            multiline={true}
                        />
                        <TouchableOpacity
                            style={[styles.sendButton, !replyText.trim() && styles.sendButtonDisabled]}
                            onPress={handleReply}
                            disabled={!replyText.trim()}
                        >
                            <CompassIcon name='send' size={20} color={theme.buttonColor}/>
                        </TouchableOpacity>
                    </View>
                )}
            </SafeAreaView>
        );
    }

    // ── Compose view (main) ──
    const renderListItem = ({item}: {item: UserModel | ChannelModel}) => {
        const isMember = activeTab === 'member';
        const isSelected = selectedTargetId === item.id;

        if (isMember) {
            const user = item as UserModel;
            const name = `${user.firstName} ${user.lastName}`.trim() || user.username;
            const meta = user.position || '';
            return (
                <TouchableOpacity
                    style={[styles.listItem, isSelected && styles.selectedItem]}
                    onPress={() => handleSelectTarget(item)}
                    activeOpacity={0.7}
                >
                    <ProfilePicture author={user} size={40} showStatus={false}/>
                    <View style={styles.itemInfo}>
                        <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
                        {Boolean(meta) && <Text style={styles.itemMeta} numberOfLines={1}>{meta}</Text>}
                    </View>
                    <View style={[styles.checkmark, isSelected && styles.checkmarkSelected]}>
                        {isSelected && <CompassIcon name='check' size={14} color='#fff'/>}
                    </View>
                </TouchableOpacity>
            );
        }

        const channel = item as ChannelModel;
        const name = channel.displayName || channel.name || '';
        return (
            <TouchableOpacity
                style={[styles.listItem, isSelected && styles.selectedItem]}
                onPress={() => handleSelectTarget(item)}
                activeOpacity={0.7}
            >
                <View style={styles.groupAvatar}>
                    <CompassIcon name='account-multiple-outline' size={24} color={theme.centerChannelColor}/>
                </View>
                <View style={styles.itemInfo}>
                    <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
                </View>
                <View style={[styles.checkmark, isSelected && styles.checkmarkSelected]}>
                    {isSelected && <CompassIcon name='check' size={14} color='#fff'/>}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.flex} testID='consultation.panel'>
            {/* Tabs */}
            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'member' && styles.activeTab]}
                    onPress={() => {
                        setActiveTab('member');
                        setSelectedTargetId('');
                        setSelectedTargetName('');
                    }}
                >
                    <Text style={[styles.tabText, activeTab === 'member' && styles.activeTabText]}>
                        {intl.formatMessage({id: 'consultation.target.tab_members', defaultMessage: 'Internal Members'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'group' && styles.activeTab]}
                    onPress={() => {
                        setActiveTab('group');
                        setSelectedTargetId('');
                        setSelectedTargetName('');
                    }}
                >
                    <Text style={[styles.tabText, activeTab === 'group' && styles.activeTabText]}>
                        {intl.formatMessage({id: 'consultation.target.tab_groups', defaultMessage: 'Internal Groups'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
                <View style={styles.searchInput}>
                    <CompassIcon name='magnify' size={20} color={changeOpacity(theme.centerChannelColor, 0.56)}/>
                    <TextInput
                        style={styles.searchText}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder={intl.formatMessage({id: 'consultation.target.search_placeholder', defaultMessage: 'Search experts...'})}
                        placeholderTextColor={changeOpacity(theme.centerChannelColor, 0.56)}
                    />
                </View>
            </View>

            {/* List */}
            <FlatList
                data={filteredList}
                keyExtractor={(item) => item.id}
                renderItem={renderListItem}
                keyboardShouldPersistTaps='handled'
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <CompassIcon name='account-search-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                        <Text style={styles.emptyText}>
                            {intl.formatMessage({id: 'consultation.target.no_results', defaultMessage: 'No experts found'})}
                        </Text>
                    </View>
                }
            />

            {/* History section - show existing open consultations */}
            {consultations.length > 0 && (
                <View>
                    <View style={styles.historySection}>
                        <Text style={styles.historyTitle}>
                            {intl.formatMessage({id: 'consultation.history', defaultMessage: 'History'})}
                        </Text>
                    </View>
                    <FlatList
                        data={consultations.slice(0, 3)}
                        keyExtractor={(item) => item.id}
                        renderItem={({item}) => (
                            <TouchableOpacity
                                style={styles.historyCard}
                                onPress={() => handleSelectConsultation(item)}
                                activeOpacity={0.7}
                            >
                                <View style={styles.historyCardText}>
                                    <Text style={styles.historyQuestion} numberOfLines={1}>
                                        {item.question}
                                    </Text>
                                    <Text style={styles.historyMeta}>
                                        {item.target_display_name || item.target_username}
                                    </Text>
                                </View>
                                <Text style={styles.historyStatus}>
                                    {item.status === 'closed'
                                        ? intl.formatMessage({id: 'consultation.status.closed', defaultMessage: 'Closed'})
                                        : intl.formatMessage({id: 'consultation.status.open', defaultMessage: 'Open'})}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            )}

            {/* Bottom input bar */}
            <View style={styles.inputBar}>
                <TextInput
                    style={styles.inputField}
                    value={questionText}
                    onChangeText={setQuestionText}
                    placeholder={selectedTargetName
                        ? intl.formatMessage(
                            {id: 'consultation.question_to', defaultMessage: 'Ask {name}...'},
                            {name: selectedTargetName},
                        )
                        : intl.formatMessage({id: 'consultation.question_placeholder', defaultMessage: 'Type your question...'})
                    }
                    multiline={true}
                    editable={Boolean(selectedTargetId)}
                />
                <TouchableOpacity
                    style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                    onPress={handleSend}
                    disabled={!canSend}
                >
                    {submitting
                        ? <Loading color={theme.buttonColor} size='small'/>
                        : <CompassIcon name='send' size={20} color={theme.buttonColor}/>
                    }
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
};

export default ConsultationPanel;
