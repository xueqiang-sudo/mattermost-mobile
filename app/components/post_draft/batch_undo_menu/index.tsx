// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {useIntl} from 'react-intl';
import {Modal, Text, TouchableOpacity} from 'react-native';
import Animated from 'react-native-reanimated';

import {useTheme} from '@context/theme';
import {changeOpacity, makeStyleSheetFromTheme} from '@utils/theme';
import {typography} from '@utils/typography';

type Props = {
    visible: boolean;
    postId: string;
    postIds: string[];
    onUndoSingle: (postId: string) => void;
    onUndoAll: () => void;
    onHide: () => void;
}

const getStyleSheet = makeStyleSheetFromTheme((theme: Theme) => ({
    overlay: {
        flex: 1,
        backgroundColor: changeOpacity('#000', 0.5),
        justifyContent: 'flex-end',
    },
    container: {
        backgroundColor: theme.centerChannelBg,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 34,
    },
    title: {
        ...typography('Heading', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.16),
    },
    menuItem: {
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: changeOpacity(theme.centerChannelColor, 0.08),
    },
    menuItemText: {
        ...typography('Body', 200, 'Regular'),
        color: theme.centerChannelColor,
    },
    dangerMenuItemText: {
        color: theme.errorTextColor,
    },
    cancelButton: {
        marginTop: 8,
        paddingVertical: 16,
        paddingHorizontal: 16,
        backgroundColor: changeOpacity(theme.centerChannelColor, 0.08),
        borderRadius: 8,
    },
    cancelButtonText: {
        ...typography('Body', 200, 'SemiBold'),
        color: theme.centerChannelColor,
        textAlign: 'center',
    },
}));

const BatchUndoMenu = ({
    visible,
    postId,
    postIds,
    onUndoSingle,
    onUndoAll,
    onHide,
}: Props) => {
    const intl = useIntl();
    const theme = useTheme();
    const styles = getStyleSheet(theme);

    const handleUndoSingle = () => {
        onUndoSingle(postId);
        onHide();
    };

    const handleUndoAll = () => {
        onUndoAll();
        onHide();
    };

    if (!visible) {
        return null;
    }

    return (
        <Modal
            visible={visible}
            transparent={true}
            animationType='slide'
            onRequestClose={onHide}
        >
            <TouchableOpacity
                style={styles.overlay}
                activeOpacity={1}
                onPress={onHide}
            >
                <Animated.View style={styles.container}>
                    <Text style={styles.title}>
                        {intl.formatMessage({id: 'batch_undo.title', defaultMessage: 'Recall Message'})}
                    </Text>

                    <TouchableOpacity
                        style={styles.menuItem}
                        onPress={handleUndoSingle}
                    >
                        <Text style={styles.menuItemText}>
                            {intl.formatMessage({id: 'batch_undo.recall_single', defaultMessage: 'Recall this message'})}
                        </Text>
                    </TouchableOpacity>

                    {postIds.length > 1 && (
                        <TouchableOpacity
                            style={styles.menuItem}
                            onPress={handleUndoAll}
                        >
                            <Text style={[styles.menuItemText, styles.dangerMenuItemText]}>
                                {intl.formatMessage(
                                    {id: 'batch_undo.recall_all', defaultMessage: 'Recall all messages sent this time'},
                                )}
                            </Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        style={styles.cancelButton}
                        onPress={onHide}
                    >
                        <Text style={styles.cancelButtonText}>
                            {intl.formatMessage({id: 'batch_undo.cancel', defaultMessage: 'Cancel'})}
                        </Text>
                    </TouchableOpacity>
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
};

export default BatchUndoMenu;
