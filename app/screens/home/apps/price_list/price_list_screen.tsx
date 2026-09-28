// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useNavigation} from '@react-navigation/native';
import React, {useCallback, useEffect, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import {SafeAreaView} from 'react-native-safe-area-context';

import CompassIcon from '@components/compass_icon';
import NavigationHeader from '@components/navigation_header';
import {useServerUrl} from '@context/server';
import {useTheme} from '@context/theme';
import DatabaseManager from '@database/manager';
import NetworkManager from '@managers/network_manager';
import {getCurrentTeamId} from '@queries/servers/system';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

import {
    deletePriceFile,
    getPriceFileDownloadUrl,
    listPriceFiles,
    type PriceFile,
} from '../workbench_api';

// ---- Helpers ----

function formatFileSize(bytes: number): string {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

// ---- Styles ----

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.centerChannelBg,
    },
    content: {
        flex: 1,
    },
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.1),
    },
    uploadBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.buttonBg,
        borderRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 6,
    },
    uploadBtnDisabled: {
        opacity: 0.6,
    },
    uploadBtnText: {
        color: theme.buttonColor,
        ...typography('Body', 75, 'SemiBold'),
    },
    refreshBtn: {
        padding: 8,
        marginLeft: 'auto',
    },
    fileCard: {
        marginHorizontal: 12,
        marginVertical: 6,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.02),
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.08),
        padding: 14,
    },
    fileHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    fileIcon: {
        marginRight: 10,
        marginTop: 2,
    },
    fileName: {
        ...typography('Body', 100, 'SemiBold'),
        color: theme.centerChannelColor,
        flex: 1,
    },
    fileInfo: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 10,
        paddingLeft: 34,
    },
    fileInfoText: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.56),
    },
    fileActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 4,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: changeOpacity(theme.centerChannelColor, 0.16),
        gap: 4,
    },
    actionBtnText: {
        ...typography('Body', 50),
        color: theme.centerChannelColor,
    },
    deleteBtn: {
        borderColor: changeOpacity(theme.errorTextColor, 0.4),
    },
    deleteBtnText: {
        color: theme.errorTextColor,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 24,
    },
    emptyIcon: {
        marginBottom: 16,
    },
    emptyText: {
        ...typography('Body', 200),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        textAlign: 'center',
    },
    emptySubtext: {
        ...typography('Body', 75),
        color: changeOpacity(theme.centerChannelColor, 0.32),
        textAlign: 'center',
        marginTop: 8,
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    errorBanner: {
        ...typography('Body', 75),
        color: theme.errorTextColor,
        padding: 12,
        backgroundColor: changeOpacity(theme.errorTextColor, 0.08),
    },
    countText: {
        ...typography('Body', 50),
        color: changeOpacity(theme.centerChannelColor, 0.4),
        paddingHorizontal: 16,
        paddingVertical: 6,
    },
}));

// ---- Main Screen ----

const PriceListScreen = () => {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const navigation = useNavigation();
    const style = getStyleSheet(theme);

    const [teamId, setTeamId] = useState('');
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [files, setFiles] = useState<PriceFile[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Init: load team ID
    useEffect(() => {
        const init = async () => {
            try {
                const {database} = DatabaseManager.getServerDatabaseAndOperator(serverUrl);
                const tid = await getCurrentTeamId(database);
                setTeamId(tid);
            } catch {
                // ignore
            }
        };
        init();
    }, [serverUrl]);

    // Load files
    const loadFiles = useCallback(async () => {
        if (!teamId) return;
        setError(null);
        try {
            const data = await listPriceFiles(serverUrl, teamId);
            setFiles(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
        } finally {
            setLoading(false);
        }
    }, [serverUrl, teamId]);

    useEffect(() => {
        if (!teamId) return;
        setLoading(true);
        loadFiles();
    }, [teamId, loadFiles]);

    // Upload file
    const handleUpload = useCallback(async () => {
        try {
            const result = await DocumentPicker.pickSingle({
                type: [DocumentPicker.types.allFiles],
                copyTo: 'cachesDirectory',
            });

            if (!result.fileCopyUri || !result.name) {
                return;
            }

            setUploading(true);
            setError(null);

            const formData = new FormData();
            formData.append('file', {
                uri: result.fileCopyUri,
                type: result.type || 'application/octet-stream',
                name: result.name,
            } as any);
            formData.append('team_id', teamId);

            const client = NetworkManager.getClient(serverUrl);
            await client.doFetch(
                '/plugins/com.mattermost.fact-extractor/api/price-file/upload',
                {
                    method: 'POST',
                    body: formData,
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                },
            );

            await loadFiles();
        } catch (e: any) {
            if (!DocumentPicker.isCancel(e)) {
                setError(e instanceof Error ? e.message : String(e));
            }
        } finally {
            setUploading(false);
        }
    }, [serverUrl, teamId, loadFiles]);

    // Delete file
    const handleDelete = useCallback((file: PriceFile) => {
        const msg = intl.formatMessage(
            {id: 'workbench.price_list.delete_confirm', defaultMessage: 'Are you sure you want to delete "{filename}"?'},
            {filename: file.filename},
        );

        Alert.alert(
            intl.formatMessage({id: 'workbench.price_list.delete_title', defaultMessage: 'Delete Price File'}),
            msg,
            [
                {
                    text: intl.formatMessage({id: 'workbench.price_list.cancel', defaultMessage: 'Cancel'}),
                    style: 'cancel',
                },
                {
                    text: intl.formatMessage({id: 'workbench.price_list.delete', defaultMessage: 'Delete'}),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deletePriceFile(serverUrl, teamId, file.filename);
                            await loadFiles();
                        } catch (e) {
                            Alert.alert(
                                intl.formatMessage({id: 'workbench.price_list.error', defaultMessage: 'Error'}),
                                e instanceof Error ? e.message : String(e),
                            );
                        }
                    },
                },
            ],
        );
    }, [serverUrl, teamId, intl, loadFiles]);

    // Download file
    const handleDownload = useCallback((file: PriceFile) => {
        const downloadUrl = getPriceFileDownloadUrl(serverUrl, teamId, file.filename);
        Linking.openURL(downloadUrl).catch(() => {
            Alert.alert(
                intl.formatMessage({id: 'workbench.price_list.error', defaultMessage: 'Error'}),
                intl.formatMessage({id: 'workbench.price_list.download_failed', defaultMessage: 'Failed to open download link'}),
            );
        });
    }, [serverUrl, teamId, intl]);

    // Back handler
    const handleBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    // Render file item
    const renderFileItem = useCallback(({item}: {item: PriceFile}) => (
        <View style={style.fileCard}>
            <View style={style.fileHeader}>
                <CompassIcon
                    name='file-document-outline'
                    size={24}
                    color={theme.buttonBg}
                    style={style.fileIcon}
                />
                <Text style={style.fileName} numberOfLines={2}>
                    {item.filename}
                </Text>
            </View>

            <View style={style.fileInfo}>
                <Text style={style.fileInfoText}>
                    {formatFileSize(item.fileSize)}
                </Text>
                <Text style={style.fileInfoText}>
                    {formatDate(item.createdAt)}
                </Text>
            </View>

            <View style={style.fileActions}>
                <TouchableOpacity
                    style={style.actionBtn}
                    onPress={() => handleDownload(item)}
                >
                    <CompassIcon name='download-outline' size={16} color={theme.centerChannelColor}/>
                    <Text style={style.actionBtnText}>
                        {intl.formatMessage({id: 'workbench.price_list.download', defaultMessage: 'Download'})}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[style.actionBtn, style.deleteBtn]}
                    onPress={() => handleDelete(item)}
                >
                    <CompassIcon name='trash-can-outline' size={16} color={theme.errorTextColor}/>
                    <Text style={[style.actionBtnText, style.deleteBtnText]}>
                        {intl.formatMessage({id: 'workbench.price_list.delete', defaultMessage: 'Delete'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    ), [style, theme, intl, handleDownload, handleDelete]);

    const keyExtractor = useCallback((item: PriceFile) => item.filename, []);

    const renderEmpty = useCallback(() => {
        if (loading) return null;
        return (
            <View style={style.emptyContainer}>
                <CompassIcon
                    name='file-document-outline'
                    size={64}
                    color={changeOpacity(theme.centerChannelColor, 0.2)}
                    style={style.emptyIcon}
                />
                <Text style={style.emptyText}>
                    {intl.formatMessage({id: 'workbench.price_list.empty', defaultMessage: 'No price files'})}
                </Text>
                <Text style={style.emptySubtext}>
                    {intl.formatMessage({id: 'workbench.price_list.empty_hint', defaultMessage: 'Upload a price file to get started'})}
                </Text>
            </View>
        );
    }, [loading, style, theme, intl]);

    // Loading state
    if (loading && files.length === 0) {
        return (
            <SafeAreaView edges={['top', 'left', 'right']} style={style.container}>
                <NavigationHeader
                    title={intl.formatMessage({id: 'workbench.price_list.title', defaultMessage: 'Price List'})}
                    onBackPress={handleBack}
                />
                <View style={style.loadingContainer}>
                    <ActivityIndicator size='large' color={theme.centerChannelColor}/>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView edges={['top', 'left', 'right']} style={style.container}>
            <NavigationHeader
                title={intl.formatMessage({id: 'workbench.price_list.title', defaultMessage: 'Price List'})}
                onBackPress={handleBack}
            />

            <View style={style.content}>
                {error ? <Text style={style.errorBanner}>{error}</Text> : null}

                {/* Toolbar */}
                <View style={style.toolbar}>
                    <TouchableOpacity
                        style={[style.uploadBtn, uploading && style.uploadBtnDisabled]}
                        onPress={handleUpload}
                        disabled={uploading}
                    >
                        {uploading ? (
                            <ActivityIndicator size='small' color={theme.buttonColor}/>
                        ) : (
                            <CompassIcon name='upload-outline' size={18} color={theme.buttonColor}/>
                        )}
                        <Text style={style.uploadBtnText}>
                            {uploading
                                ? intl.formatMessage({id: 'workbench.price_list.uploading', defaultMessage: 'Uploading...'})
                                : intl.formatMessage({id: 'workbench.price_list.upload', defaultMessage: 'Upload File'})
                            }
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={style.refreshBtn} onPress={loadFiles}>
                        <CompassIcon name='refresh' size={20} color={theme.centerChannelColor}/>
                    </TouchableOpacity>
                </View>

                {/* File count */}
                {files.length > 0 && (
                    <Text style={style.countText}>
                        {intl.formatMessage(
                            {id: 'workbench.price_list.file_count', defaultMessage: '{count} {count, plural, one {file} other {files}}'},
                            {count: files.length},
                        )}
                    </Text>
                )}

                {/* File list */}
                <FlatList
                    data={files}
                    renderItem={renderFileItem}
                    keyExtractor={keyExtractor}
                    ListEmptyComponent={renderEmpty}
                    contentContainerStyle={files.length === 0 ? {flex: 1} : undefined}
                    showsVerticalScrollIndicator={false}
                />
            </View>
        </SafeAreaView>
    );
};

export default PriceListScreen;
