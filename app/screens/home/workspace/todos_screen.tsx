// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useLayoutEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import {NetworkManager} from '@managers/network_manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {deleteTodo, fetchUserTodos, updateTodo, type UserTodo} from '../apps/api';

const getStyles = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingTop: 12,
        paddingBottom: 8,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 600, 'SemiBold'),
        marginLeft: 4,
    },
    card: {
        marginHorizontal: 16,
        marginBottom: 12,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 12,
        padding: 16,
        borderWidth: 0.5,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    channelName: {
        color: theme.buttonBg,
        ...typography('Body', 75, 'SemiBold'),
        marginBottom: 6,
    },
    todoText: {
        color: theme.centerChannelColor,
        ...typography('Body', 200, 'Regular'),
        lineHeight: 22,
        flex: 1,
    },
    date: {
        color: changeOpacity(theme.centerChannelColor, 0.48),
        ...typography('Body', 50, 'Regular'),
        marginTop: 8,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
        marginTop: 10,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    actionBtnText: {
        ...typography('Body', 75, 'SemiBold'),
        marginLeft: 4,
    },
    empty: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        ...typography('Body', 200, 'Regular'),
        marginTop: 12,
    },
    loading: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        paddingHorizontal: 24,
    },
    modalContent: {
        backgroundColor: theme.centerChannelBg,
        borderRadius: 12,
        padding: 20,
    },
    modalTitle: {
        color: theme.centerChannelColor,
        ...typography('Heading', 400, 'SemiBold'),
        marginBottom: 16,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        borderRadius: 8,
        padding: 12,
        fontSize: 15,
        color: theme.centerChannelColor,
        minHeight: 80,
        textAlignVertical: 'top',
        marginBottom: 16,
    },
    modalActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 12,
    },
    modalBtn: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    modalBtnCancel: {
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    modalBtnConfirm: {
        backgroundColor: theme.buttonBg,
    },
    modalBtnText: {
        ...typography('Body', 200, 'SemiBold'),
    },
}));

const TodosScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const styles = getStyles(theme);

    useLayoutEffect(() => {
        navigation.setOptions({title: intl.formatMessage({id: 'workspace.todos.title', defaultMessage: 'To-Do'})});
    }, [navigation, intl]);

    const [todos, setTodos] = useState<UserTodo[]>([]);
    const [loading, setLoading] = useState(true);
    const [teamId, setTeamId] = useState('');

    // Edit modal
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editTodo, setEditTodo] = useState<UserTodo | null>(null);
    const [editText, setEditText] = useState('');
    const [saving, setSaving] = useState(false);

    const loadTodos = useCallback(async () => {
        setLoading(true);
        try {
            const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
            const tid = await getCurrentTeamId(database);
            setTeamId(tid);
            const data = await fetchUserTodos(serverUrl, tid);
            setTodos(data);
        } catch (e) {
            setTodos([]);
        } finally {
            setLoading(false);
        }
    }, [serverUrl]);

    useEffect(() => {
        loadTodos();
    }, [loadTodos]);

    const handleEdit = useCallback((todo: UserTodo) => {
        setEditTodo(todo);
        setEditText(todo.text);
        setEditModalVisible(true);
    }, []);

    const handleSaveEdit = useCallback(async () => {
        if (!editTodo || !editText.trim()) {return;}
        setSaving(true);
        try {
            const result = await updateTodo(serverUrl, teamId, editTodo.channel_id, editTodo.lineNumber, editText.trim());
            if (result.ok) {
                // Post a system message to the channel about the update
                try {
                    const client = NetworkManager.getClient(serverUrl);
                    const noticeText = intl.formatMessage(
                        {id: 'workspace.todos.update_notice', defaultMessage: '📝 To-Do updated:\n\n{text}'},
                        {text: editText.trim()},
                    );
                    await client.createPost({
                        channel_id: editTodo.channel_id,
                        message: noticeText,
                        type: 'system_generic',
                    } as any);
                } catch {
                    // Don't fail the edit if posting fails
                }

                setEditModalVisible(false);
                setEditTodo(null);
                // Reload todos
                const data = await fetchUserTodos(serverUrl, teamId);
                setTodos(data);
            } else {
                Alert.alert(
                    intl.formatMessage({id: 'workspace.todos.error', defaultMessage: 'Error'}),
                    result.error || intl.formatMessage({id: 'workspace.todos.update_failed', defaultMessage: 'Update failed'}),
                );
            }
        } catch (e: any) {
            Alert.alert(
                intl.formatMessage({id: 'workspace.todos.error', defaultMessage: 'Error'}),
                String(e?.message || e),
            );
        } finally {
            setSaving(false);
        }
    }, [editTodo, editText, serverUrl, teamId, intl]);

    const handleDelete = useCallback((todo: UserTodo) => {
        Alert.alert(
            intl.formatMessage({id: 'workspace.todos.delete_title', defaultMessage: 'Delete To-Do'}),
            intl.formatMessage({id: 'workspace.todos.delete_message', defaultMessage: 'Are you sure you want to delete this to-do item?'}),
            [
                {
                    text: intl.formatMessage({id: 'mobile.components.select_channel_view.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'workspace.todos.delete_confirm', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const result = await deleteTodo(serverUrl, teamId, todo.channel_id, todo.lineNumber);
                            if (result.ok) {
                                // Reload todos
                                const data = await fetchUserTodos(serverUrl, teamId);
                                setTodos(data);
                            } else {
                                Alert.alert(
                                    intl.formatMessage({id: 'workspace.todos.error', defaultMessage: 'Error'}),
                                    result.error || intl.formatMessage({id: 'workspace.todos.delete_failed', defaultMessage: 'Delete failed'}),
                                );
                            }
                        } catch (e: any) {
                            Alert.alert(
                                intl.formatMessage({id: 'workspace.todos.error', defaultMessage: 'Error'}),
                                String(e?.message || e),
                            );
                        }
                    },
                },
            ],
        );
    }, [serverUrl, teamId, intl]);

    const renderItem = ({item}: {item: UserTodo}) => (
        <View style={styles.card}>
            {item.channel_name ? (
                <Text style={styles.channelName}># {item.channel_name}</Text>
            ) : null}
            <Text style={styles.todoText}>{item.text}</Text>
            {item.date ? (
                <Text style={styles.date}>{item.date}</Text>
            ) : null}
            <View style={styles.actions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleEdit(item)}>
                    <CompassIcon name='pencil-outline' size={16} color={theme.buttonBg}/>
                    <Text style={[styles.actionBtnText, {color: theme.buttonBg}]}>
                        {intl.formatMessage({id: 'workspace.todos.edit', defaultMessage: 'Edit'})}
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
                    <CompassIcon name='trash-can-outline' size={16} color={theme.errorTextColor}/>
                    <Text style={[styles.actionBtnText, {color: theme.errorTextColor}]}>
                        {intl.formatMessage({id: 'workspace.todos.delete', defaultMessage: 'Delete'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    if (loading) {
        return (
            <SafeAreaView style={styles.container} edges={[]}>
                <View style={styles.loading}>
                    <ActivityIndicator size='large' color={theme.buttonBg}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={[]} testID='todos.screen'>
            {todos.length === 0 ? (
                <View style={styles.empty}>
                    <CompassIcon name='check-circle-outline' size={48} color={changeOpacity(theme.centerChannelColor, 0.32)}/>
                    <Text style={styles.emptyText}>
                        {intl.formatMessage({id: 'workspace.todos.empty', defaultMessage: 'No pending tasks'})}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={todos}
                    renderItem={renderItem}
                    keyExtractor={(item, index) => `${item.path}-${item.lineNumber}-${index}`}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{paddingBottom: 20}}
                />
            )}

            {/* Edit Modal */}
            <Modal
                visible={editModalVisible}
                transparent={true}
                animationType='fade'
                onRequestClose={() => setEditModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {intl.formatMessage({id: 'workspace.todos.edit_title', defaultMessage: 'Edit To-Do'})}
                        </Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editText}
                            onChangeText={setEditText}
                            multiline={true}
                            autoFocus={true}
                            placeholder={intl.formatMessage({id: 'workspace.todos.edit_placeholder', defaultMessage: 'Enter to-do content...'})}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnCancel]}
                                onPress={() => setEditModalVisible(false)}
                                disabled={saving}
                            >
                                <Text style={[styles.modalBtnText, {color: changeOpacity(theme.centerChannelColor, 0.72)}]}>
                                    {intl.formatMessage({id: 'mobile.components.select_channel_view.cancel', defaultMessage: 'Cancel'})}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalBtn, styles.modalBtnConfirm]}
                                onPress={handleSaveEdit}
                                disabled={saving || !editText.trim()}
                            >
                                <Text style={[styles.modalBtnText, {color: theme.buttonColor}]}>
                                    {saving
                                        ? intl.formatMessage({id: 'workspace.todos.saving', defaultMessage: 'Saving...'})
                                        : intl.formatMessage({id: 'workspace.todos.save', defaultMessage: 'Save'})}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

export default TodosScreen;
