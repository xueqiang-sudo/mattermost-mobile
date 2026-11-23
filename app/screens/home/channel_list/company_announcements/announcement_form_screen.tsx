// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, Keyboard, ScrollView, Switch, Text, TextInput, TouchableOpacity, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {dismissModal} from '@screens/navigation';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {createAnnouncement, updateAnnouncement} from './announcement_api';
import type {Announcement, AnnouncementFormData} from './types';

type Props = {
    componentId: string;
    mode: 'create' | 'edit';
    announcement?: Announcement;
};

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: theme.sidebarBg,
    },
    backButton: {
        padding: 4,
        marginRight: 8,
    },
    headerTitle: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.sidebarText,
        flex: 1,
    },
    submitBtn: {
        backgroundColor: theme.buttonBg,
        borderRadius: 6,
        paddingHorizontal: 16,
        paddingVertical: 8,
    },
    submitBtnText: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.buttonColor,
    },
    submitBtnDisabled: {
        opacity: 0.5,
    },
    content: {
        flex: 1,
        padding: 16,
    },
    fieldGroup: {
        marginBottom: 20,
    },
    label: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        marginBottom: 8,
    },
    required: {
        color: theme.errorTextColor,
    },
    input: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
    },
    textArea: {
        minHeight: 150,
        textAlignVertical: 'top',
    },
    priorityOptions: {
        flexDirection: 'row',
        gap: 12,
    },
    priorityOption: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 2,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    priorityOptionSelected: {
        borderColor: theme.buttonBg,
        backgroundColor: changeOpacity(theme.buttonBg, 0.08),
    },
    priorityDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 6,
    },
    priorityLabel: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
    },
    toggleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
    },
    toggleLabel: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
    },
}));

const PRIORITY_COLORS: Record<string, string> = {
    normal: '#6B7280',
    important: '#F59E0B',
    urgent: '#EF4444',
};

const AnnouncementFormScreen = ({componentId, mode, announcement}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const styles = getStyles(theme);

    const isEdit = mode === 'edit';

    const [title, setTitle] = useState(announcement?.title || '');
    const [content, setContent] = useState(announcement?.content || '');
    const [priority, setPriority] = useState<'normal' | 'important' | 'urgent'>(announcement?.priority || 'normal');
    const [isPinned, setIsPinned] = useState(announcement?.is_pinned || false);
    const [submitting, setSubmitting] = useState(false);

    const isValid = title.trim() && content.trim();

    const handleSubmit = useCallback(async () => {
        if (!isValid || submitting) {return;}
        Keyboard.dismiss();
        setSubmitting(true);
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const teamId = await getCurrentTeamId(database);
            if (!teamId) {
                Alert.alert(
                    intl.formatMessage({id: 'error', defaultMessage: '错误'}),
                    intl.formatMessage({id: 'announcement.error.no_team', defaultMessage: '无法获取团队信息'}),
                );
                return;
            }
            const formData: AnnouncementFormData = {
                title: title.trim(),
                content: content.trim(),
                priority,
                is_pinned: isPinned,
            };
            if (isEdit && announcement) {
                await updateAnnouncement(serverUrl, teamId, announcement.id, formData);
            } else {
                await createAnnouncement(serverUrl, teamId, formData);
            }
            dismissModal({componentId});
        } catch (e: any) {
            Alert.alert(
                intl.formatMessage({id: 'error', defaultMessage: '错误'}),
                e?.message || String(e),
            );
        } finally {
            setSubmitting(false);
        }
    }, [serverUrl, title, content, priority, isPinned, isValid, submitting, isEdit, announcement, intl, componentId]);

    const renderPriorityOption = (value: 'normal' | 'important' | 'urgent', label: string) => {
        const isSelected = priority === value;
        const color = PRIORITY_COLORS[value];
        return (
            <TouchableOpacity
                key={value}
                style={[styles.priorityOption, isSelected && styles.priorityOptionSelected]}
                onPress={() => setPriority(value)}
            >
                <View style={[styles.priorityDot, {backgroundColor: color}]}/>
                <Text style={styles.priorityLabel}>{label}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => dismissModal({componentId})}>
                    <CompassIcon name='arrow-left' size={24} color={theme.sidebarText}/>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({
                        id: isEdit ? 'announcement.edit' : 'announcement.publish',
                        defaultMessage: isEdit ? '编辑公告' : '发布公告',
                    })}
                </Text>
                <TouchableOpacity
                    style={[styles.submitBtn, (!isValid || submitting) && styles.submitBtnDisabled]}
                    onPress={handleSubmit}
                    disabled={!isValid || submitting}
                >
                    <Text style={styles.submitBtnText}>
                        {submitting ? '...' : intl.formatMessage({id: 'announcement.submit', defaultMessage: '发布'})}
                    </Text>
                </TouchableOpacity>
            </View>
            <ScrollView style={styles.content} keyboardShouldPersistTaps='handled' showsVerticalScrollIndicator={false}>
                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>
                        {intl.formatMessage({id: 'announcement.form.title', defaultMessage: '标题'})}
                        <Text style={styles.required}> *</Text>
                    </Text>
                    <TextInput
                        style={styles.input}
                        value={title}
                        onChangeText={setTitle}
                        placeholder={intl.formatMessage({id: 'announcement.form.title_placeholder', defaultMessage: '请输入公告标题'})}
                        maxLength={100}
                    />
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>
                        {intl.formatMessage({id: 'announcement.form.priority', defaultMessage: '优先级'})}
                    </Text>
                    <View style={styles.priorityOptions}>
                        {renderPriorityOption('normal', intl.formatMessage({id: 'announcement.priority.normal', defaultMessage: '普通'}))}
                        {renderPriorityOption('important', intl.formatMessage({id: 'announcement.priority.important', defaultMessage: '重要'}))}
                        {renderPriorityOption('urgent', intl.formatMessage({id: 'announcement.priority.urgent', defaultMessage: '紧急'}))}
                    </View>
                </View>

                <View style={styles.fieldGroup}>
                    <Text style={styles.label}>
                        {intl.formatMessage({id: 'announcement.form.content', defaultMessage: '正文'})}
                        <Text style={styles.required}> *</Text>
                    </Text>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        value={content}
                        onChangeText={setContent}
                        placeholder={intl.formatMessage({id: 'announcement.form.content_placeholder', defaultMessage: '请输入公告内容'})}
                        multiline={true}
                        textAlignVertical='top'
                    />
                </View>

                <View style={styles.fieldGroup}>
                    <View style={styles.toggleRow}>
                        <Text style={styles.toggleLabel}>
                            {intl.formatMessage({id: 'announcement.form.pin', defaultMessage: '置顶此公告'})}
                        </Text>
                        <Switch
                            value={isPinned}
                            onValueChange={setIsPinned}
                            trackColor={{false: changeOpacity(theme.centerChannelColor, 0.16), true: theme.buttonBg}}
                        />
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

export default AnnouncementFormScreen;
