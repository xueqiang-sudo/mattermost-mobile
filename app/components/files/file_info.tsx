// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import {useIntl} from 'react-intl';

import {useTheme} from '@context/theme';
import {getFormattedFileSize} from '@utils/file';
import {truncateFileName} from '@utils/file_name_truncate';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type FileInfoProps = {
    disabled?: boolean;
    currentUserId?: string;
    file: FileInfo;
    showDate: boolean;
    channelName?: string;
    onPress: () => void;
    /** true：在文件行内占满剩余宽度；false：随文件名/大小收缩（微信气泡内非图附件） */
    fillRemainingRow?: boolean;
    /** false：不使用内部触摸组件，由父级处理触摸事件 */
    touchable?: boolean;
};

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => {
    return {
        attachmentContainer: {
            flexShrink: 1,
            justifyContent: 'center',
            minWidth: 0,
        },
        attachmentContainerFill: {
            flex: 1,
        },
        fileInfoTouchable: {
            flexShrink: 1,
        },
        fileDownloadContainer: {
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: 3,
        },
        infoText: {
            color: changeOpacity(theme.centerChannelColor, 0.64),
            ...typography('Body', 75, 'Regular'),
        },
        fileName: {
            color: theme.centerChannelColor,
            ...typography('Body', 200, 'SemiBold'),
        },
        fileExtension: {
            color: theme.centerChannelColor,
            ...typography('Body', 200, 'SemiBold'),
        },
        channelWrapper: {
            flexShrink: 1,
            marginRight: 4,
            backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
            paddingHorizontal: 4,
            borderRadius: 4,
        },
        channelText: {
            ...typography('Body', 50, 'SemiBold'),
            color: changeOpacity(theme.centerChannelColor, 0.72),
        },
        statusText: {
            ...typography('Body', 75, 'Regular'),
            marginLeft: 8,
        },
        uploadingText: {
            color: changeOpacity(theme.centerChannelColor, 0.48),
        },
        notDownloadedText: {
            color: '#E57373',
        },
    };
});

const FileInfo = ({disabled, currentUserId, file, channelName, fillRemainingRow = true, showDate, onPress, touchable = true}: FileInfoProps) => {
    const theme = useTheme();
    const style = getStyleSheet(theme);
    const intl = useIntl();

    // 智能截断文件名，保留扩展名（微信风格：中间省略，保留前后关键部分）
    const {name, ext} = truncateFileName(file.name.trim(), 30);

    // 微信风格：发送状态指示（仅显示发送中/对方发送中）
    const uploadStatus = (file as any)._uploadStatus as string | undefined;
    const isSameAccount = Boolean(currentUserId && file.user_id === currentUserId);

    let statusText = '';
    if (uploadStatus === 'uploading') {
        if (isSameAccount) {
            statusText = intl.formatMessage({id: 'file.status.uploading', defaultMessage: '发送中'});
        } else {
            statusText = intl.formatMessage({id: 'file.status.peer_uploading', defaultMessage: '对方发送中'});
        }
    }

    const content = (
        <>
            <Text
                numberOfLines={1}
                style={style.fileName}
            >
                {name}
                {ext ? <Text style={style.fileExtension}>.{ext}</Text> : null}
            </Text>
            <View style={style.fileDownloadContainer}>
                {channelName &&
                    <View style={style.channelWrapper}>
                        <Text
                            style={style.channelText}
                            numberOfLines={1}
                        >
                            {channelName}
                        </Text>
                    </View>
                }
                <Text style={style.infoText}>
                    {`${getFormattedFileSize(file.size)}`}
                </Text>
                {statusText ? (
                    <Text style={[style.statusText, style.uploadingText]}>
                        {statusText}
                    </Text>
                ) : null}
            </View>
        </>
    );

    return (
        <View style={[style.attachmentContainer, fillRemainingRow && style.attachmentContainerFill]}>
            {touchable ? (
                <TouchableOpacity
                    disabled={disabled}
                    onPress={onPress}
                    style={style.fileInfoTouchable}
                >
                    {content}
                </TouchableOpacity>
            ) : (
                <View style={style.fileInfoTouchable}>
                    {content}
                </View>
            )}
        </View>
    );
};

export default FileInfo;
