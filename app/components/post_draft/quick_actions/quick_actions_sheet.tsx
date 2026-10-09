// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {useTheme} from '@context/theme';
import {TITLE_HEIGHT} from '@screens/bottom_sheet/content';
import {bottomSheet} from '@screens/navigation';
import {debugLog} from '@store/debug_log';
import {fileMaxWarning} from '@utils/file';
import type {DraftVideoProcessingBridge} from '@utils/file/draft_video_local_processing';
import PickerUtil from '@utils/file/file_picker';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import CameraType from './camera_quick_action/camera_type';

const GRID_COLUMNS = 3;
const ICON_LABEL_GAP = 8;
const WECHAT_ICON_SIZE = 52;

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
        fontSize: 13,
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
    fileCount,
    maxFileCount,
    addFiles,
    draftVideoProcessingBridge,
    onDismiss,
}: Props) {
    const intl = useIntl();
    const theme = useTheme();
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
        debugLog('QUICK_ACTION', 'handleFilePress called');
        if (maxFilesReached) {
            debugLog('QUICK_ACTION', 'maxFilesReached, showing alert');
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        debugLog('QUICK_ACTION', 'creating PickerUtil and calling attachFileFromFiles');
        const picker = new PickerUtil(intl, addFiles, draftVideoProcessingBridge);
        picker.attachFileFromFiles(undefined, true);
    }, [intl, addFiles, draftVideoProcessingBridge, maxFilesReached, maxFileCount]);

    const handleGalleryPress = useCallback(() => {
        debugLog('QUICK_ACTION', 'handleGalleryPress called');
        if (maxFilesReached) {
            debugLog('QUICK_ACTION', 'maxFilesReached, showing alert');
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        debugLog('QUICK_ACTION', 'creating PickerUtil and calling attachFileFromPhotoGallery');
        const picker = new PickerUtil(intl, addFiles, draftVideoProcessingBridge);
        picker.attachFileFromPhotoGallery(maxFileCount - fileCount);
    }, [intl, addFiles, draftVideoProcessingBridge, fileCount, maxFileCount, maxFilesReached]);

    const handleCameraPress = useCallback((options: {type?: string}) => {
        debugLog('QUICK_ACTION', `handleCameraPress called, options: ${JSON.stringify(options)}`);
        if (maxFilesReached) {
            debugLog('QUICK_ACTION', 'maxFilesReached, showing alert');
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        debugLog('QUICK_ACTION', 'creating PickerUtil and calling attachFileFromCamera');
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
            key: 'camera',
            icon: 'camera-outline',
            labelId: 'post_draft.quick_action.camera',
            labelDefault: 'Camera',
            disabled: fileDisabled,
            onPress: wrapWithDismiss(() => {
                bottomSheet({
                    title: intl.formatMessage({id: 'mobile.camera_type.title', defaultMessage: 'Camera options'}),
                    renderContent: () => (
                        <CameraType
                            onPress={handleCameraPress}
                            onVisionVideoPress={handleVisionVideoPress}
                        />
                    ),
                    snapPoints: [1, bottomSheetSnapPoint(2, ITEM_HEIGHT) + TITLE_HEIGHT],
                    theme,
                    closeButtonId: 'camera-close-sheet',
                });
            }),
            testID: `${baseTestID}.camera_action`,
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
