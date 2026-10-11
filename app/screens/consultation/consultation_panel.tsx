// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    Alert,
    DeviceEventEmitter,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {useDatabase} from '@nozbe/watermelondb/react';

import CompassIcon from '@components/compass_icon';
import Loading from '@components/loading';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import useNavButtonPressed from '@hooks/navigation_button_pressed';
import {usePreventDoubleTap} from '@hooks/utils';
import {queryAllChannelsForTeam} from '@queries/servers/channel';
import {getCurrentUserId} from '@queries/servers/system';
import {queryAllUsers, observeUserIdsInTeam} from '@queries/servers/user';
import {displayUsername} from '@utils/user';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    createConsultation,
    listConsultations,
    getConsultationResponses,
    replyToConsultation,
    forwardMultipleResponsesToCustomer,
    closeConsultation,
    injectConsultationSummary,
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
    label: {
        ...typography('Body', 75, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
        marginTop: 16,
        paddingHorizontal: 16,
    },
    selectBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        marginHorizontal: 16,
    },
    selectText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    selectTextPlaceholder: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    dropdown: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        marginTop: 4,
        maxHeight: 200,
        backgroundColor: theme.centerChannelBg,
        marginHorizontal: 16,
    },
    dropdownItem: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.06),
    },
    dropdownItemText: {
        ...typography('Body', 100, 'Regular'),
        color: theme.centerChannelColor,
    },
    dropdownItemSelected: {
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    clearButton: {
        padding: 4,
    },
    dropdownContainer: {
        paddingVertical: 8,
        paddingHorizontal: 0,
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
    const [memberDropdownOpen, setMemberDropdownOpen] = useState(false);
    const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);

    // Forward edit modal state
    const [forwardBatchEditVisible, setForwardBatchEditVisible] = useState(false);
    const [forwardBatchTexts, setForwardBatchTexts] = useState<Map<string, string>>(new Map());

    // Load current user ID
    useEffect(() => {
        (async () => {
            const uid = await getCurrentUserId(database);
            setCurrentUserId(uid);
        })();
    }, [database]);

    // Load users via observable - filter by team membership
    useEffect(() => {
        if (!teamId) {
            return;
        }
        let teamUserIds = new Set<string>();
        const teamSub = observeUserIdsInTeam(database, teamId).subscribe((ids) => {
            teamUserIds = ids;
        });
        const userSub = queryAllUsers(database).observe().subscribe((u) => {
            setUsers(u.filter((user) => user.id !== currentUserId && teamUserIds.has(user.id)));
        });
        return () => {
            teamSub.unsubscribe();
            userSub.unsubscribe();
        };
    }, [database, currentUserId, teamId]);

    // Load channels via observable - only GM and DM (not channels)
    useEffect(() => {
        if (!teamId) {
            return;
        }
        const sub = queryAllChannelsForTeam(database, teamId).observe().subscribe((c) => {
            setChannels(c.filter((ch) => ch.type === 'G' || ch.type === 'D'));
        });
        return () => sub.unsubscribe();
    }, [database, teamId]);

    // Load existing consultations (only used for auto-navigate after create)
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

    // List based on active tab
    const filteredList = useMemo(() => {
        if (activeTab === 'member') {
            return users;
        }
        return channels;
    }, [activeTab, users, channels]);

    const handleClose = useCallback(() => {
        if (selectedConsultation && selectedConsultation.status !== 'closed') {
            // Fire-and-forget: send consultation data to fact-extractor for AI summarization
            const expertResponses = responses
                .filter((r) => !r.is_requester)
                .map((r) => ({
                    author_name: r.author_name,
                    message: r.message.length > 500 ? r.message.slice(0, 500) + '...' : r.message,
                    forwarded: r.forwarded,
                }));
            const forwardedCount = expertResponses.filter((r) => r.forwarded).length;

            injectConsultationSummary(serverUrl, {
                consultation_id: selectedConsultation.id,
                source_channel_id: selectedConsultation.source_channel_id,
                target_display_name: selectedConsultation.target_display_name || selectedConsultation.target_username,
                is_group_consult: selectedConsultation.is_group_consult,
                expert_group_name: selectedConsultation.expert_group_name,
                question: selectedConsultation.question,
                responses: expertResponses,
                forwarded_count: forwardedCount,
            }).catch(() => {});

            closeConsultation(serverUrl, selectedConsultation.id).catch(() => {});
        }
        dismissModal({componentId});
    }, [componentId, selectedConsultation, serverUrl, responses]);

    useNavButtonPressed('close-consultation-panel', componentId, handleClose, [handleClose]);

    const handleSelectTarget = useCallback((item: UserModel | ChannelModel) => {
        if (activeTab === 'member') {
            const user = item as UserModel;
            const name = displayUsername(user, 'zh-CN', 'nickname_full_name') || user.username;
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
        if (!questionText.trim() || submitting) {
            return;
        }
        if (!selectedTargetId) {
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
            // Reload consultations and auto-navigate to the new one
            const result = await listConsultations(serverUrl, channelId);
            const newList = result.consultations || [];
            setConsultations(newList);
            if (newList.length > 0) {
                handleSelectConsultation(newList[0]);
            }
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'consultation.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'consultation.submit_failed', defaultMessage: 'Failed to send consultation.'}),
            );
        } finally {
            setSubmitting(false);
        }
    }, [channelId, isGroupTarget, questionText, selectedTargetId, serverUrl, submitting, teamId, intl, handleSelectConsultation]));

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

    const handleBatchForward = usePreventDoubleTap(useCallback(() => {
        if (!selectedConsultation || selectedResponseIds.size === 0) {
            return;
        }
        // Open batch edit modal
        const selectedResponses = responses.filter((r) => selectedResponseIds.has(r.post_id));
        const texts = new Map<string, string>();
        for (const r of selectedResponses) {
            texts.set(r.post_id, r.message);
        }
        setForwardBatchTexts(texts);
        setForwardBatchEditVisible(true);
    }, [selectedConsultation, selectedResponseIds, responses]));

    const confirmBatchForward = usePreventDoubleTap(useCallback(async () => {
        if (!selectedConsultation || forwarding) {
            return;
        }
        setForwarding(true);
        try {
            const items = Array.from(forwardBatchTexts.entries()).map(([postId, message]) => ({
                responseId: postId,
                message: message.trim(),
            }));
            await forwardMultipleResponsesToCustomer(serverUrl, selectedConsultation.id, items);
            const forwardedIds = new Set(forwardBatchTexts.keys());
            setResponses((prev) =>
                prev.map((r) =>
                    forwardedIds.has(r.post_id) ? {...r, forwarded: true} : r,
                ),
            );
            setSelectedResponseIds(new Set());
            setSelectMode(false);
            setForwardBatchEditVisible(false);
        } catch {
            Alert.alert(
                intl.formatMessage({id: 'consultation.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'consultation.forward_failed', defaultMessage: 'Failed to forward response.'}),
            );
        } finally {
            setForwarding(false);
        }
    }, [selectedConsultation, forwardBatchTexts, forwarding, serverUrl, intl]));

    const canSend = questionText.trim().length > 0 && !submitting && selectedTargetId.length > 0;

    // ── Detail view (thread) ──
    const isDetailView = activeView === 'detail' && selectedConsultation;
    const isOpen = selectedConsultation?.status !== 'closed';
    const hasUnforwardedExpertResponses = responses.some((r) => !r.is_requester && !r.forwarded);

    // ── Compose view (main) ──
    const isDropdownOpen = activeTab === 'member' ? memberDropdownOpen : groupDropdownOpen;

    return (
        <SafeAreaView style={styles.flex} testID='consultation.panel'>
            {isDetailView ? (
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 110 : 0}
                >
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
                        ) : null
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
                </KeyboardAvoidingView>
            ) : (
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 110 : 0}
            >
                {/* Tabs */}
                <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'member' && styles.activeTab]}
                    onPress={() => {
                        setActiveTab('member');
                        setMemberDropdownOpen(false);
                        setGroupDropdownOpen(false);
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
                        setMemberDropdownOpen(false);
                        setGroupDropdownOpen(false);
                        setSelectedTargetId('');
                        setSelectedTargetName('');
                    }}
                >
                    <Text style={[styles.tabText, activeTab === 'group' && styles.activeTabText]}>
                        {intl.formatMessage({id: 'consultation.target.tab_groups', defaultMessage: 'Internal Groups'})}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Dropdown selector - fixed */}
            <View style={styles.dropdownContainer}>
                <Text style={styles.label}>
                    {intl.formatMessage({id: 'consultation.select_target', defaultMessage: 'Select Consultation Target'})}
                </Text>
                <TouchableOpacity
                    style={styles.selectBtn}
                    onPress={() => {
                        if (activeTab === 'member') {
                            setGroupDropdownOpen(false);
                            setMemberDropdownOpen(!memberDropdownOpen);
                        } else {
                            setMemberDropdownOpen(false);
                            setGroupDropdownOpen(!groupDropdownOpen);
                        }
                    }}
                >
                    <Text style={[styles.selectText, !selectedTargetName && styles.selectTextPlaceholder]} numberOfLines={1}>
                        {selectedTargetName || (activeTab === 'member'
                            ? intl.formatMessage({id: 'consultation.select_member_placeholder', defaultMessage: 'Select internal member...'})
                            : intl.formatMessage({id: 'consultation.select_group_placeholder', defaultMessage: 'Select internal group...'})
                        )}
                    </Text>
                    {selectedTargetName ? (
                        <TouchableOpacity
                            style={styles.clearButton}
                            onPress={() => {
                                setSelectedTargetId('');
                                setSelectedTargetName('');
                                setMemberDropdownOpen(false);
                                setGroupDropdownOpen(false);
                            }}
                        >
                            <CompassIcon name='close-circle' size={20} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
                        </TouchableOpacity>
                    ) : (
                        <CompassIcon name={isDropdownOpen ? 'menu-up' : 'menu-down'} size={20} color={changeOpacity(theme.centerChannelColor, 0.48)}/>
                    )}
                </TouchableOpacity>
            </View>

            {/* Scrollable area: dropdown list + history */}
            <ScrollView style={styles.flex} keyboardShouldPersistTaps='handled'>
                {/* Dropdown list */}
                {isDropdownOpen && (
                    <ScrollView style={styles.dropdown} nestedScrollEnabled={true}>
                        {filteredList.map((item) => {
                            const isSelected = selectedTargetId === item.id;
                            const name = activeTab === 'member'
                                ? displayUsername(item as UserModel, 'zh-CN', 'nickname_full_name') || (item as UserModel).username
                                : ((item as ChannelModel).displayName || (item as ChannelModel).name || '');
                            return (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                                    onPress={() => {
                                        handleSelectTarget(item);
                                        setMemberDropdownOpen(false);
                                        setGroupDropdownOpen(false);
                                    }}
                                >
                                    <Text style={styles.dropdownItemText} numberOfLines={1}>{name}</Text>
                                </TouchableOpacity>
                            );
                        })}
                        {filteredList.length === 0 && (
                            <View style={styles.emptyState}>
                                <Text style={styles.emptyText}>
                                    {intl.formatMessage({id: 'consultation.target.no_results', defaultMessage: 'No results'})}
                                </Text>
                            </View>
                        )}
                    </ScrollView>
                )}

            </ScrollView>

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
            </KeyboardAvoidingView>
            )}

            {/* Forward Edit Modal (batch) */}
            <Modal visible={forwardBatchEditVisible} transparent={true} animationType='fade'>
                <View style={modalStyles.overlay}>
                    <View style={modalStyles.container}>
                        <Text style={modalStyles.title}>
                            {intl.formatMessage(
                                {id: 'consultation.forward_multi.title', defaultMessage: 'Batch Forward to Customer ({count} items)'},
                                {count: forwardBatchTexts.size},
                            )}
                        </Text>
                        <ScrollView style={modalStyles.batchScroll} nestedScrollEnabled={true}>
                            {Array.from(forwardBatchTexts.entries()).map(([postId, text]) => (
                                <View key={postId} style={modalStyles.batchItem}>
                                    <TextInput
                                        style={modalStyles.textarea}
                                        value={text}
                                        onChangeText={(val) => {
                                            setForwardBatchTexts((prev) => {
                                                const next = new Map(prev);
                                                next.set(postId, val);
                                                return next;
                                            });
                                        }}
                                        multiline={true}
                                    />
                                </View>
                            ))}
                        </ScrollView>
                        <View style={modalStyles.buttons}>
                            <TouchableOpacity
                                style={modalStyles.cancelButton}
                                onPress={() => setForwardBatchEditVisible(false)}
                            >
                                <Text style={modalStyles.cancelButtonText}>
                                    {intl.formatMessage({id: 'consultation.cancel', defaultMessage: 'Cancel'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={modalStyles.confirmButton}
                                onPress={confirmBatchForward}
                                disabled={forwarding}
                            >
                                <Text style={modalStyles.confirmButtonText}>
                                    {forwarding
                                        ? intl.formatMessage({id: 'consultation.forwarding', defaultMessage: 'Forwarding...'})
                                        : intl.formatMessage({id: 'consultation.forward_confirm', defaultMessage: 'Forward'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const modalStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    container: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        maxHeight: '80%',
    },
    title: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
    },
    textarea: {
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        minHeight: 80,
        textAlignVertical: 'top',
    },
    batchScroll: {
        maxHeight: 300,
        marginBottom: 12,
    },
    batchItem: {
        marginBottom: 12,
    },
    buttons: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        marginTop: 16,
        gap: 12,
    },
    cancelButton: {
        paddingHorizontal: 16,
        paddingVertical: 10,
    },
    cancelButtonText: {
        fontSize: 14,
        color: '#666',
    },
    confirmButton: {
        backgroundColor: '#166DE0',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    confirmButtonText: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '600',
    },
});

export default ConsultationPanel;
