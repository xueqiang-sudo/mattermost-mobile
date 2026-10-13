// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Alert, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useTheme} from '@context/theme';
import CompassIcon from '@components/compass_icon';
import {dismissModal} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {changeOpacity} from '@utils/theme';

import {FilePickerProvider, useFilePicker} from './context/file_picker_context';
import GroupFilesTab from './tabs/group_files_tab';
import PhotoAlbumTab from './tabs/photo_album_tab';
import FilesTab from './tabs/files_tab';

import type {FileInfo} from '@mattermost/types/files';

type TabKey = 'group_files' | 'photo_album' | 'files';

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5E5',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    closeButton: {
        padding: 4,
    },
    tabBar: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E5E5',
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 12,
        position: 'relative',
    },
    tabLabel: {
        fontSize: 15,
        fontWeight: '500',
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        height: 3,
        width: '60%',
        borderRadius: 1.5,
    },
    tabContent: {
        flex: 1,
    },
    actionBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E5E5',
        backgroundColor: '#fff',
    },
    selectedCount: {
        fontSize: 14,
        color: '#666',
    },
    sendButton: {
        backgroundColor: '#07C160',
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 24,
    },
    sendButtonDisabled: {
        backgroundColor: '#C7C7C7',
    },
    sendButtonText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '600',
    },
});

type FilePickerContentProps = {
    onSend: (files: FileInfo[]) => void;
};

function FilePickerContent({onSend}: FilePickerContentProps) {
    const intl = useIntl();
    const theme = useTheme();
    const {getSelectedFiles, getSelectedCount, state} = useFilePicker();
    const [activeTab, setActiveTab] = useState<TabKey>('group_files');
    debugLog('filePicker', `FilePickerContent rendering, activeTab=${activeTab}`);

    const handleClose = useCallback(() => {
        dismissModal();
    }, []);

    const handleSend = useCallback(() => {
        const files = getSelectedFiles();
        if (files.length === 0) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                intl.formatMessage({
                    id: 'file_picker.no_files_selected',
                    defaultMessage: 'Please select at least one file to send.',
                }),
            );
            return;
        }

        onSend(files);
        dismissModal();
    }, [getSelectedFiles, onSend, intl]);

    const selectedCount = getSelectedCount();
    const maxSelection = state.maxSelection;
    const canSend = selectedCount > 0;

    const tabs: {key: TabKey; label: string}[] = [
        {key: 'group_files', label: intl.formatMessage({id: 'file_picker.tab.group_files', defaultMessage: 'Group Files'})},
        {key: 'photo_album', label: intl.formatMessage({id: 'file_picker.tab.photo_album', defaultMessage: 'Photos'})},
        {key: 'files', label: intl.formatMessage({id: 'file_picker.tab.files', defaultMessage: 'Files'})},
    ];

    const renderTabContent = () => {
        switch (activeTab) {
            case 'group_files':
                return <GroupFilesTab/>;
            case 'photo_album':
                return <PhotoAlbumTab/>;
            case 'files':
                return <FilesTab/>;
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity
                    onPress={handleClose}
                    style={styles.closeButton}
                >
                    <CompassIcon
                        name='close'
                        size={24}
                        color={theme.centerChannelColor}
                    />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {intl.formatMessage({
                        id: 'file_picker.title',
                        defaultMessage: 'Select Files',
                    })}
                </Text>
                <View style={{width: 32}}/>
            </View>

            <View style={styles.tabBar}>
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                        <TouchableOpacity
                            key={tab.key}
                            style={styles.tabItem}
                            onPress={() => {
                                debugLog('filePicker', `Tab changed to: ${tab.key}`);
                                setActiveTab(tab.key);
                            }}
                        >
                            <Text style={[
                                styles.tabLabel,
                                {color: isActive ? theme.buttonBg : changeOpacity(theme.centerChannelColor, 0.6)},
                            ]}>
                                {tab.label}
                            </Text>
                            {isActive && (
                                <View style={[styles.tabIndicator, {backgroundColor: theme.buttonBg}]}/>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>

            <View style={styles.tabContent}>
                {renderTabContent()}
            </View>

            <View style={styles.actionBar}>
                <Text style={styles.selectedCount}>
                    {intl.formatMessage(
                        {
                            id: 'file_picker.selected_count',
                            defaultMessage: '{count}/{max} selected',
                        },
                        {
                            count: selectedCount,
                            max: maxSelection,
                        },
                    )}
                </Text>
                <TouchableOpacity
                    onPress={handleSend}
                    style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
                    disabled={!canSend}
                >
                    <Text style={styles.sendButtonText}>
                        {intl.formatMessage({
                            id: 'file_picker.send',
                            defaultMessage: 'Send',
                        })}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

type FilePickerProps = {
    onSend: (files: FileInfo[]) => void;
};

export default function FilePicker({onSend}: FilePickerProps) {
    debugLog('filePicker', 'FilePicker component rendering');
    return (
        <FilePickerProvider maxSelection={9}>
            <FilePickerContent onSend={onSend}/>
        </FilePickerProvider>
    );
}
