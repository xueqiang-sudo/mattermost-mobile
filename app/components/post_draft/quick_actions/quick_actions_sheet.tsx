// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useIntl} from 'react-intl';
import {Alert, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import FormattedText from '@components/formatted_text';
import TouchableWithFeedback from '@components/touchable_with_feedback';
import {ICON_SIZE} from '@constants/post_draft';
import {Screens} from '@constants';
import {ITEM_HEIGHT} from '@components/slide_up_panel_item';
import {TITLE_HEIGHT} from '@screens/bottom_sheet/content';
import {useTheme} from '@context/theme';
import {useIsTablet} from '@hooks/device';
import {bottomSheet, openAsBottomSheet} from '@screens/navigation';
import {bottomSheetSnapPoint} from '@utils/helpers';
import {fileMaxWarning} from '@utils/file';
import PickerUtil from '@utils/file/file_picker';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';

import CameraType from './camera_quick_action/camera_type';

const GRID_COLUMNS = 3;
const ICON_LABEL_GAP = 6;

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
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    cell: {
        width: `${100 / GRID_COLUMNS}%`,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingVertical: 12,
    },
    iconWrapper: {
        width: ICON_SIZE + 20,
        height: ICON_SIZE + 20,
        borderRadius: 8,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.06),
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: ICON_LABEL_GAP,
    },
    label: {
        fontSize: 12,
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
                    size={ICON_SIZE}
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
    canShowSlashCommands?: boolean;
    maxFileCount: number;
    value: string;
    updateValue: (value: string) => void;
    addFiles: (files: FileInfo[]) => void;
    postPriority: PostPriority;
    updatePostPriority: (postPriority: PostPriority) => void;
    focus: () => void;
    onDismiss: () => void;
};

const POST_PRIORITY_PICKER_BUTTON = 'close-post-priority-picker-sheet';

export default function QuickActionsSheet({
    testID,
    canUploadFiles,
    fileCount,
    isPostPriorityEnabled,
    canShowPostPriority = true,
    canShowSlashCommands = true,
    maxFileCount,
    value,
    updateValue,
    addFiles,
    postPriority,
    updatePostPriority,
    focus,
    onDismiss,
}: Props) {
    const intl = useIntl();
    const theme = useTheme();
    const isTablet = useIsTablet();
    const atDisabled = value[value.length - 1] === '@';
    const slashDisabled = value.length > 0;
    const maxFilesReached = fileCount >= maxFileCount;

    const wrapWithDismiss = useCallback((fn: () => void) => {
        return () => {
            onDismiss();
            setTimeout(fn, 150);
        };
    }, [onDismiss]);

    const handleAtPress = useCallback(() => {
        updateValue((v) => (v.length > 0 && !v.endsWith(' ') ? `${v} @` : `${v}@`));
        focus();
    }, [updateValue, focus]);

    const handleSlashPress = useCallback(() => {
        updateValue((v) => `${v}/`);
        focus();
    }, [updateValue, focus]);

    const handleFilePress = useCallback(() => {
        if (maxFilesReached) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        const picker = new PickerUtil(intl, addFiles);
        picker.attachFileFromFiles(undefined, true);
    }, [intl, addFiles, maxFilesReached, maxFileCount]);

    const handleGalleryPress = useCallback(() => {
        if (maxFilesReached) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        const picker = new PickerUtil(intl, addFiles);
        picker.attachFileFromPhotoGallery(maxFileCount - fileCount);
    }, [intl, addFiles, fileCount, maxFileCount, maxFilesReached]);

    const handleCameraPress = useCallback((options: {type?: string}) => {
        if (maxFilesReached) {
            Alert.alert(
                intl.formatMessage({id: 'mobile.link.error.title', defaultMessage: 'Error'}),
                fileMaxWarning(intl, maxFileCount),
            );
            return;
        }
        const picker = new PickerUtil(intl, addFiles);
        picker.attachFileFromCamera(options);
    }, [intl, addFiles, maxFileCount, maxFilesReached]);

    const handlePriorityPress = useCallback(() => {
        const title = isTablet ? intl.formatMessage({id: 'post_priority.picker.title', defaultMessage: 'Message priority'}) : '';
        openAsBottomSheet({
            closeButtonId: POST_PRIORITY_PICKER_BUTTON,
            screen: Screens.POST_PRIORITY_PICKER,
            theme,
            title,
            props: {
                postPriority,
                updatePostPriority,
                closeButtonId: POST_PRIORITY_PICKER_BUTTON,
            },
        });
    }, [isTablet, intl, theme, postPriority, updatePostPriority]);

    const baseTestID = testID ?? 'quick_actions_sheet';
    const fileDisabled = !canUploadFiles;

    const items: Array<{key: string; icon: string; labelId: string; labelDefault: string; disabled: boolean; onPress: () => void; testID: string}> = [
        {
            key: 'at',
            icon: 'at',
            labelId: 'post_draft.quick_action.at_mention',
            labelDefault: '@ Mention',
            disabled: atDisabled,
            onPress: wrapWithDismiss(handleAtPress),
            testID: `${baseTestID}.at_action`,
        },
        ...(canShowSlashCommands ? [{
            key: 'slash',
            icon: 'slash-forward-box-outline',
            labelId: 'post_draft.quick_action.slash_command',
            labelDefault: '/ Command',
            disabled: slashDisabled,
            onPress: wrapWithDismiss(handleSlashPress),
            testID: `${baseTestID}.slash_action`,
        }] : []),
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
                    renderContent: () => <CameraType onPress={handleCameraPress} />,
                    snapPoints: [1, bottomSheetSnapPoint(2, ITEM_HEIGHT) + TITLE_HEIGHT],
                    theme,
                    closeButtonId: 'camera-close-sheet',
                });
            }),
            testID: `${baseTestID}.camera_action`,
        },
        ...(isPostPriorityEnabled && canShowPostPriority ? [{
            key: 'priority',
            icon: 'alert-circle-outline',
            labelId: 'post_draft.quick_action.priority',
            labelDefault: 'Priority',
            disabled: false,
            onPress: wrapWithDismiss(handlePriorityPress),
            testID: `${baseTestID}.post_priority_action`,
        }] : []),
    ];

    return (
        <View style={getStyleSheet(theme).grid} testID={baseTestID}>
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
