// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import Clipboard from '@react-native-clipboard/clipboard';
import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';

import CompassIcon from '@components/compass_icon';
import {SNACK_BAR_TYPE} from '@constants/snack_bar';
import {ANDROID_33, OS_VERSION} from '@constants/versions';
import {useTheme} from '@context/theme';
import {showSnackBar} from '@utils/snack_bar';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    id: string;
    label: string;
    testID?: string;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    label: {
        color: changeOpacity(theme.centerChannelColor, 0.56),
        marginRight: 8,
        ...typography('Body', 200, 'SemiBold'),
    },
    row: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.04),
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    value: {
        flex: 1,
        fontFamily: Platform.select({ios: 'Menlo', android: 'monospace', default: 'monospace'}),
        fontSize: 13,
        color: theme.centerChannelColor,
        ...typography('Body', 100),
    },
    copyBtn: {
        marginLeft: 8,
        padding: 4,
    },
    copiedHint: {
        color: '#3db887',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 8,
    },
}));

const IdField = ({id, label, testID}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        Clipboard.setString(id);
        if ((Platform.OS === OS_VERSION.ANDROID && Number(Platform.Version) < ANDROID_33) || Platform.OS === OS_VERSION.IOS) {
            showSnackBar({barType: SNACK_BAR_TYPE.TEXT_COPIED});
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }, [id]);

    return (
        <View style={styles.container} testID={testID}>
            <Text style={styles.label}>{label}</Text>
            <View style={styles.row}>
                <Text
                    style={styles.value}
                    numberOfLines={1}
                    selectable={true}
                >
                    {id}
                </Text>
                {copied ? (
                    <Text style={styles.copiedHint}>
                        {intl.formatMessage({id: 'channel_info.id.copied', defaultMessage: 'Copied'})}
                    </Text>
                ) : (
                    <TouchableOpacity
                        onPress={handleCopy}
                        style={styles.copyBtn}
                        testID={`${testID}.copy`}
                    >
                        <CompassIcon
                            name='content-copy'
                            size={18}
                            color={changeOpacity(theme.centerChannelColor, 0.56)}
                        />
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

export default IdField;
