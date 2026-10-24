// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {useTheme} from '@context/theme';
import {fileMaxWarning} from '@utils/file';
import type {DraftVideoProcessingBridge} from '@utils/file/draft_video_local_processing';
import PickerUtil from '@utils/file/file_picker';
import {debugLog} from '@store/debug_log';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import {showFilePickerScreen} from '@screens/file_picker/show_modal';
import {showCloudDrivePickerModal} from '@screens/cloud_drive_picker/show_modal';
import {useServerUrl} from '@context/server';
import DatabaseManager from '@database/manager';
import {getCurrentTeamId} from '@queries/servers/system';

const GRID_COLUMNS = 3;
const ICON_LABEL_GAP = 8;
const WECHAT_ICON_SIZE = 64;

type SheetItemProps = {
    iconName: string;
    labelId: string;
    labelDefault: string;
    disabled?: boolean;
    onPress: () => void;
    testID?: string;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingVertical: 16,
        paddingHorizontal: 12,
    },
    cell: {
        width: `${100 / GRID_COLUMNS}%`,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 16,
    },
    iconWrapper: {
        width: WECHAT_ICON_SIZE,
        height: WECHAT_ICON_SIZE,
        borderRadius: 10,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: ICON_LABEL_GAP,
    },
    label: {
        fontSize: 14,
        color: theme.centerChannelColor,
    },
}));

function SheetItem({iconName, labelId, labelDefault, disabled, onPress, testID}: SheetItemProps) {
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const color = disabled ? changeOpacity(theme.centerChannelColor, 0.16) : changeOpacity(theme.centerChannelColor, 0.72);

    return (
        <TouchableWithFeedback
            testID={testID}
            disabled={disabled}
            onPress={onPress}
            style={styles.cell}
            type='opacity'
        >
            <View style={styles.iconWrapper}>
                <CompassIcon
                    name={iconName}
                    color={color}
                    size={WECHAT_ICON_SIZE * 0.55}
                />
            </View>
            <FormattedText
                id={labelId}
                defaultMessage={labelDefault}
                style={styles.label}
                numberOfLines={1}
                ellipsizeMode='tail'
            />
        </TouchableWithFeedback>
    );
}

type Props = {
    testID?: string;
    canUploadFiles: boolean;
    channelId: string;
    fileCount: number;
    isPostPriorityEnabled: boolean;
    canShowPostPriority?: boolean;
    maxFileCount: number;
    value: string;
    updateValue: (value: string) => void;
    addFiles: (files: FileInfo[]) => void;
    draftVideoProcessingBridge?: DraftVideoProcessingBridge;
    postPriority: PostPriority;
    updatePostPriority: (postPriority: PostPriority) => void;
    focus: () => void;
    onDismiss: () => void | Promise<void>;
};

export default function QuickActionsSheet({
    testID,
    canUploadFiles,
    channelId,
    fileCount,
    maxFileCount,
    addFiles,
    draftVideoProcessingBridge,
    onDismiss,
}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const serverUrl = useServerUrl();
    const maxFilesReached = fileCount >= maxFileCount;

    const wrapWithDismiss = useCallback((fn: () => void) => {
        return () => {
            void (async () => {
                try {
                    await onDismiss();
                } finally {
                    fn();
                }
            })();
        };
    }, [onDismiss]);

    const handleFilePress = useCallback(() => {
        debugLog('filePicker', `handleFilePress: file button pressed, channelId=${channelId}`);
        if (maxFilesReached) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        debugLog('filePicker', 'handleFilePress: calling showFilePickerScreen');
        const title = intl.formatMessage({id: 'file_picker.title', defaultMessage: 'Select Files'});
        showFilePickerScreen(channelId, (files) => {
            debugLog('filePicker', `handleFilePress: onSend callback with ${files.length} files`);
            try {
                files.forEach((file, index) => {
                    debugLog('filePicker', `Processing file ${index + 1} in addFiles:`, {
                        name: file.name,
                        uri: file.uri,
                        id: file.id,
                    });
                });
                addFiles(files);
                debugLog('filePicker', 'addFiles completed successfully');
            } catch (error) {
                debugLog('filePicker', `addFiles error: ${error instanceof Error ? error.message : String(error)}`);
                debugLog('filePicker', `Error stack: ${error instanceof Error ? error.stack : 'N/A'}`);
                Alert.alert(
                    intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                    intl.formatMessage({
                        id: 'file_picker.add_files_error',
                        defaultMessage: 'Failed to add files. Please try again.',
                    }),
                );
            }
        }, title);
    }, [addFiles, channelId, intl, maxFilesReached, maxFileCount]);

    const handleCloudDrivePress = useCallback(async () => {
        if (maxFilesReached) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        const database = DatabaseManager.serverDatabases[serverUrl]?.database;
        if (!database) return;
        const teamId = await getCurrentTeamId(database);
        if (!teamId) return;
        // Pass addFiles so the cloud drive picker can feed files into the
        // optimistic rendering pipeline (same flow as the photo gallery),
        // instead of waiting for the server createPost round-trip.
        showCloudDrivePickerModal(channelId, teamId, (files) => {
            try {
                addFiles(files);
            } catch (error) {
                Alert.alert(
                    intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                    intl.formatMessage({
                        id: 'file_picker.add_files_error',
                        defaultMessage: 'Failed to add files. Please try again.',
                    }),
                );
            }
        });
    }, [addFiles, channelId, intl, maxFilesReached, maxFileCount, serverUrl]);

    const handleGalleryPress = useCallback(() => {
        if (maxFilesReached) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        const picker = new PickerUtil(intl, addFiles, draftVideoProcessingBridge);
        picker.attachFileFromPhotoGallery(maxFileCount - fileCount);
    }, [intl, addFiles, draftVideoProcessingBridge, fileCount, maxFileCount, maxFilesReached]);

    const handleCameraPress = useCallback((options: {type?: string}) => {
        if (maxFilesReached) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        const picker = new PickerUtil(intl, addFiles, draftVideoProcessingBridge);
        picker.attachFileFromCamera(options);
    }, [intl, addFiles, draftVideoProcessingBridge, maxFileCount, maxFilesReached]);

    const handleVisionVideoPress = useCallback(() => {
        if (maxFilesReached) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        const picker = new PickerUtil(intl, addFiles, draftVideoProcessingBridge);
        void picker.attachVideoFromVisionRecorder();
    }, [intl, addFiles, draftVideoProcessingBridge, maxFileCount, maxFilesReached]);

    const baseTestID = testID ?? 'quick_actions_sheet';
    const fileDisabled = !canUploadFiles;

    const items: Array<{key: string; icon: string; labelId: string; labelDefault: string; disabled: boolean; onPress: () => void; testID: string}> = [
        {
            key: 'gallery',
            icon: 'image-outline',
            labelId: 'post_draft.quick_action.gallery',
            labelDefault: 'Gallery',
            disabled: fileDisabled,
            onPress: wrapWithDismiss(handleGalleryPress),
            testID: `${baseTestID}.image_action`,
        },
        {
            key: 'camera_photo',
            icon: 'camera-outline',
            labelId: 'camera_type.photo.option',
            labelDefault: 'Capture Photo',
            disabled: fileDisabled,
            onPress: wrapWithDismiss(() => handleCameraPress({type: 'photo'})),
            testID: `${baseTestID}.camera_photo_action`,
        },
        {
            key: 'camera_video',
            icon: 'video-outline',
            labelId: 'camera_type.video.option',
            labelDefault: 'Record Video',
            disabled: fileDisabled,
            onPress: wrapWithDismiss(handleVisionVideoPress),
            testID: `${baseTestID}.camera_video_action`,
        },
        {
            key: 'file',
            icon: 'paperclip',
            labelId: 'post_draft.quick_action.file',
            labelDefault: 'File',
            disabled: fileDisabled,
            onPress: wrapWithDismiss(handleFilePress),
            testID: `${baseTestID}.file_action`,
        },
        {
            key: 'cloud_drive',
            icon: 'folder-outline',
            labelId: 'post_draft.quick_action.cloud_drive',
            labelDefault: 'Cloud Drive',
            disabled: fileDisabled,
            onPress: wrapWithDismiss(handleCloudDrivePress),
            testID: `${baseTestID}.cloud_drive_action`,
        },
    ];

    return (
        <View
            style={getStyleSheet(theme).grid}
            testID={baseTestID}
        >
            {items.map((item) => (
                <SheetItem
                    key={item.key}
                    iconName={item.icon}
                    labelId={item.labelId}
                    labelDefault={item.labelDefault}
                    disabled={item.disabled}
                    onPress={item.onPress}
                    testID={item.testID}
                />
            ))}
        </View>
    );
}
