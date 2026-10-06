// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {Text, TouchableOpacity, View} from 'react-native';

import {useTheme} from '@context/theme';
import {getFormattedFileSize} from '@utils/file';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

// 工具函数：智能截断文件名，保留扩展名
const truncateFileName = (fileName: string, maxLength: number = 20): {name: string, ext: string} => {
    const lastDotIndex = fileName.lastIndexOf('.');

    // 没有扩展名或扩展名在开头（如 .gitignore）
    if (lastDotIndex <= 0) {
        if (fileName.length > maxLength) {
            return {name: fileName.slice(0, maxLength - 3) + '...', ext: ''};
        }
        return {name: fileName, ext: ''};
    }

    const name = fileName.slice(0, lastDotIndex);
    const ext = fileName.slice(lastDotIndex + 1);

    // 计算可用长度（总长度 - "..." - 扩展名 - "."）
    const availableLength = maxLength - 3 - ext.length - 1;

    if (name.length > availableLength) {
        return {name: name.slice(0, availableLength) + '...', ext};
    }

    return {name, ext};
};

type FileInfoProps = {
    disabled?: boolean;
    file: FileInfo;
    showDate: boolean;
    channelName?: string;
    onPress: () => void;
    /** true：在文件行内占满剩余宽度；false：随文件名/大小收缩（微信气泡内非图附件） */
    fillRemainingRow?: boolean;
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
    };
});

const FileInfo = ({disabled, file, channelName, fillRemainingRow = true, showDate, onPress}: FileInfoProps) => {
    const theme = useTheme();
    const style = getStyleSheet(theme);

    // 智能截断文件名，保留扩展名
    const {name, ext} = truncateFileName(file.name.trim(), 25);

    return (
        <View style={[style.attachmentContainer, fillRemainingRow && style.attachmentContainerFill]}>
            <TouchableOpacity
                disabled={disabled}
                onPress={onPress}
                style={style.fileInfoTouchable}
            >
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
                </View>
            </TouchableOpacity>
        </View>
    );
};

export default FileInfo;
