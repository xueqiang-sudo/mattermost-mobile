// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {DeviceEventEmitter, type StyleProp, StyleSheet, View, type ViewStyle} from 'react-native';
import Animated from 'react-native-reanimated';
import {useIntl} from 'react-intl';

import {Events, Screens} from '@constants';
import {GALLERY_FOOTER_HEIGHT} from '@constants/gallery';
import {useServerUrl} from '@context/server';
import SecurityManager from '@managers/security_manager';
import {dismissOverlay, showModal} from '@screens/navigation';

import Actions from './actions';
import DownloadWithAction from './download_with_action';

import type {IntuneMAMSaveLocation} from '@managers/intune_manager/types';
import type {GalleryAction, GalleryItemType} from '@typings/screens/gallery';

type Props = {
    canDownloadFiles: boolean;
    componentId: string;
    enablePublicLink: boolean;
    enableSecureFilePreview: boolean;
    hideActions: boolean;
    item: GalleryItemType;
    style: StyleProp<ViewStyle>;
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        height: GALLERY_FOOTER_HEIGHT,
        paddingHorizontal: 20,
    },
});

const Footer = ({
    canDownloadFiles, componentId, enablePublicLink, enableSecureFilePreview,
    hideActions, item, style,
}: Props) => {
    const intl = useIntl();
    const serverUrl = useServerUrl();
    const showActions = !hideActions && Boolean(item.id) && !item.id?.startsWith('uid');
    const [action, setAction] = useState<GalleryAction>('none');

    const handleDownload = useCallback(async () => {
        setAction('downloading');
    }, []);

    const handleForward = useCallback(() => {
        dismissOverlay(componentId).then(() => {
            showModal(
                Screens.FORWARD_MESSAGE,
                intl.formatMessage({id: 'forward.title', defaultMessage: 'Forward Message'}),
                {
                    postId: item.postId || '',
                    channelId: item.channelId || '',
                    message: item.postMessage || '',
                    fileIds: [item.id!],
                },
            );
        });
    }, [componentId, item, intl]);

    const allowSaveToLocation = useMemo(() => {
        let location: keyof IntuneMAMSaveLocation = 'CameraRoll';
        if (item.type === 'file') {
            location = 'FilesApp';
        }
        return canDownloadFiles && SecurityManager.canSaveToLocation(serverUrl, location);
    }, [canDownloadFiles, item.type, serverUrl]);

    useEffect(() => {
        const listener = DeviceEventEmitter.addListener(Events.GALLERY_ACTIONS, (value: GalleryAction) => {
            setAction(value);
        });

        return () => listener.remove();
    }, []);

    return (
        <Animated.View
            style={[style]}
        >
            {action === 'downloading' && !enableSecureFilePreview && canDownloadFiles &&
                <DownloadWithAction
                    action={action}
                    enableSecureFilePreview={enableSecureFilePreview}
                    item={item}
                    setAction={setAction}
                />
            }
            <View style={styles.container}>
                {showActions &&
                <Actions
                    allowSaveToLocation={allowSaveToLocation}
                    disabled={action !== 'none'}
                    canDownloadFiles={!enableSecureFilePreview && canDownloadFiles}
                    enablePublicLinks={false}
                    fileId={item.id!}
                    onCopyPublicLink={() => {}}
                    onDownload={handleDownload}
                    onForward={handleForward}
                />
                }
            </View>
        </Animated.View>
    );
};

export default Footer;
