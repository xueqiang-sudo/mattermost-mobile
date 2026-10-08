// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import {Image} from 'expo-image';
import React, {useCallback, useState} from 'react';
import {useIntl} from 'react-intl';
import {
    ActivityIndicator,
    Alert,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Video from 'react-native-video';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Share from 'react-native-share';

import CompassIcon from '@components/compass_icon';
import {dismissOverlay} from '@screens/navigation';
import {hasPhotoLibraryWritePermission, pathWithPrefix} from '@utils/file';

interface MediaViewerScreenProps {
    componentId: string;
    uri: string;
    type?: 'image' | 'video' | 'audio';
    name?: string;
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    closeButton: {
        position: 'absolute',
        zIndex: 10,
        left: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    video: {
        flex: 1,
    },
    audioContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    audioName: {
        color: '#fff',
        fontSize: 16,
        marginTop: 20,
        textAlign: 'center',
        paddingHorizontal: 40,
    },
    toolbar: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingVertical: 12,
    },
    toolButton: {
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    toolLabel: {
        color: '#fff',
        fontSize: 12,
        marginTop: 4,
    },
});

const MediaViewerScreen = ({componentId, uri, type, name}: MediaViewerScreenProps) => {
    const intl = useIntl();
    const insets = useSafeAreaInsets();
    const [saving, setSaving] = useState(false);
    const isVideo = type === 'video';
    const isAudio = type === 'audio';

    const handleClose = useCallback(() => {
        dismissOverlay(componentId);
    }, [componentId]);

    const handleSave = useCallback(async () => {
        if (!uri || saving) {
            return;
        }

        setSaving(true);
        try {
            const hasPermission = await hasPhotoLibraryWritePermission(intl);
            if (!hasPermission) {
                Alert.alert(
                    intl.formatMessage({id: 'gallery.save_permission_denied', defaultMessage: 'Permission denied'}),
                );
                return;
            }

            const filePath = pathWithPrefix('file://', uri);
            await CameraRoll.saveAsset(filePath, {type: isVideo ? 'video' : 'photo'});
            Alert.alert(
                intl.formatMessage({id: 'gallery.saved', defaultMessage: 'Saved'}),
            );
        } catch (e: any) {
            Alert.alert(
                intl.formatMessage({id: 'gallery.save_failed', defaultMessage: 'Save failed'}),
                e?.message || String(e),
            );
        } finally {
            setSaving(false);
        }
    }, [uri, saving, isVideo, intl]);

    const handleShare = useCallback(async () => {
        if (!uri) {
            return;
        }

        try {
            await Share.open({
                url: pathWithPrefix('file://', uri),
                type: isVideo ? 'video/*' : 'image/*',
            });
        } catch {
            // User cancelled
        }
    }, [uri, isVideo]);

    return (
        <View style={[styles.container, {paddingTop: insets.top, paddingBottom: insets.bottom}]}>
            <StatusBar barStyle='light-content' backgroundColor='#000'/>

            <TouchableOpacity
                style={[styles.closeButton, {top: insets.top + 10}]}
                onPress={handleClose}
            >
                <CompassIcon name='close' size={24} color='#fff'/>
            </TouchableOpacity>

            {isVideo ? (
                <Video
                    source={{uri}}
                    style={styles.video}
                    resizeMode='contain'
                    controls={true}
                    paused={false}
                    repeat={false}
                />
            ) : isAudio ? (
                <View style={styles.audioContainer}>
                    <CompassIcon name='file-audio-outline-large' size={80} color='#fff'/>
                    {name ? <Text style={styles.audioName}>{name}</Text> : null}
                    <Video
                        source={{uri}}
                        style={{width: '100%', height: 60, marginTop: 20}}
                        controls={true}
                        paused={true}
                        repeat={false}
                    />
                </View>
            ) : (
                <View style={styles.imageContainer}>
                    <Image
                        source={{uri}}
                        style={styles.image}
                        contentFit='contain'
                        transition={200}
                    />
                </View>
            )}

            <View style={styles.toolbar}>
                {!isAudio && (
                    <TouchableOpacity
                        style={styles.toolButton}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color='#fff' size='small'/>
                        ) : (
                            <CompassIcon name='arrow-collapse-down' size={24} color='#fff'/>
                        )}
                        <Text style={styles.toolLabel}>
                            {intl.formatMessage({id: 'gallery.save', defaultMessage: 'Save'})}
                        </Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={styles.toolButton}
                    onPress={handleShare}
                >
                    <CompassIcon name='share-variant-outline' size={24} color='#fff'/>
                    <Text style={styles.toolLabel}>
                        {intl.formatMessage({id: 'gallery.share', defaultMessage: 'Share'})}
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

export default MediaViewerScreen;
