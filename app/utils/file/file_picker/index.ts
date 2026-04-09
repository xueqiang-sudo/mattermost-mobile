// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RNUtils from '@mattermost/rnutils';
import {applicationName} from 'expo-application';
import {Alert, Linking, Platform, StatusBar} from 'react-native';
import DocumentPicker, {type DocumentPickerResponse} from 'react-native-document-picker';
import {type Asset, type CameraOptions, type ImageLibraryOptions, type ImagePickerResponse, launchCamera, launchImageLibrary} from 'react-native-image-picker';
import Permissions from 'react-native-permissions';

import {showDraftVideoRecorderModal} from '@screens/draft_video_recorder/show_modal';
import {dismissBottomSheet} from '@screens/navigation';
import {extractFileInfo, lookupMimeType} from '@utils/file';
import {
    buildDraftVideoPlaceholderFile,
    clearDraftVideoProcessingAborted,
    isDraftVideoProcessingAborted,
    patchDraftVideoPlaceholder,
    type DraftVideoProcessingBridge,
} from '@utils/file/draft_video_local_processing';
import {compressChatVideoAsset} from '@utils/file/compress_chat_video';
import {
    hideVideoCompressOverlay,
    reportVideoCompressOverlayMessage,
    reportVideoCompressProgress,
    showVideoCompressOverlay,
} from '@utils/file/video_compress_overlay';
import {generateId} from '@utils/general';
import {logError, logWarning} from '@utils/log';
import {safeDecodeURIComponent} from '@utils/url';

import type {IntlShape} from 'react-intl';
import type {VideoFile} from 'react-native-vision-camera';

export type {DraftVideoProcessingBridge} from '@utils/file/draft_video_local_processing';

type PermissionSource = 'camera' | 'storage' | 'photo_android' | 'photo_ios' | 'photo';

type DraftVideoPrepareContext = {
    clientId: string;
    bridge: DraftVideoProcessingBridge;
    onCompressProgress: (progress: number) => void;
};

export default class FilePickerUtil {
    private readonly uploadFiles: (files: ExtractedFileInfo[]) => void;
    private readonly intl: IntlShape;
    private readonly draftVideoBridge?: DraftVideoProcessingBridge;

    constructor(
        intl: IntlShape,
        uploadFiles: (files: ExtractedFileInfo[]) => void,
        draftVideoBridge?: DraftVideoProcessingBridge,
    ) {
        this.intl = intl;
        this.uploadFiles = uploadFiles;
        this.draftVideoBridge = draftVideoBridge;
    }

    private getPermissionMessages = (source: PermissionSource) => {
        const {formatMessage} = this.intl;
        const permissions: Record<string, { title: string; text: string }> = {
            camera: {
                title: formatMessage(
                    {
                        id: 'mobile.camera_photo_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your camera',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.camera_photo_permission_denied_description',
                    defaultMessage:
                        'Take photos and upload them to your server or save them to your device. Open Settings to grant {applicationName} read and write access to your camera.',
                }, {applicationName}),
            },
            storage: {
                title: formatMessage(
                    {
                        id: 'mobile.storage_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your files',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.storage_permission_denied_description',
                    defaultMessage:
                        'Upload files to your server. Open Settings to grant {applicationName} Read and Write access to files on this device.',
                }, {applicationName}),
            },
            photo_ios: {
                title: formatMessage(
                    {
                        id: 'mobile.ios.photos_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your photos',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.ios.photos_permission_denied_description',
                    defaultMessage:
                        'Upload photos and videos to your server or save them to your device. Open Settings to grant {applicationName} Read and Write access to your photo and video library.',
                }, {applicationName}),
            },
            photo_android: {
                title: formatMessage(
                    {
                        id: 'mobile.android.photos_permission_denied_title',
                        defaultMessage:
                            '{applicationName} would like to access your photos',
                    },
                    {applicationName},
                ),
                text: formatMessage({
                    id: 'mobile.android.photos_permission_denied_description',
                    defaultMessage:
                        'Upload photos to your server or save them to your device. Open Settings to grant {applicationName} Read and Write access to your photo library.',
                }, {applicationName}),
            },
        };

        return permissions[source];
    };

    private fileLooksLikeVideo = (file: Asset | DocumentPickerResponse): boolean => {
        const mime = file.type || lookupMimeType(
            ('fileName' in file && file.fileName) ||
            ('name' in file && file.name) ||
            file.uri ||
            '',
        );
        if (mime.startsWith('video/')) {
            return true;
        }
        const name = ('fileName' in file && file.fileName) || ('name' in file && file.name) || '';
        const ext = name.split('.').pop()?.toLowerCase();
        return Boolean(ext && ['mp4', 'mov', 'm4v', 'webm', 'mkv', '3gp'].includes(ext));
    };

    private prepareFileUpload = async (
        files: Array<Asset | DocumentPickerResponse>,
        isVideoOverlayVisible = false,
        draftVideoContext?: DraftVideoPrepareContext,
    ) => {
        const needsVideoPass = files.some((f) => this.fileLooksLikeVideo(f));
        const shouldToggleVideoOverlay = needsVideoPass && !isVideoOverlayVisible;

        let filesToExtract = files;
        if (needsVideoPass) {
            if (shouldToggleVideoOverlay) {
                showVideoCompressOverlay(
                    this.intl.formatMessage({
                        id: 'mobile.video_upload.compressing',
                        defaultMessage: 'Compressing video…',
                    }),
                    this.intl.formatMessage({
                        id: 'mobile.video_upload.progress_label',
                        defaultMessage: 'Progress',
                    }),
                );
            }
            try {
                const next: Array<Asset | DocumentPickerResponse> = [];
                for (const f of files) {
                    if (this.fileLooksLikeVideo(f)) {
                        const clientId = draftVideoContext?.clientId;
                        const isAborted = clientId ? () => isDraftVideoProcessingAborted(clientId) : undefined;
                        // Sequential compression avoids high memory use when multiple large videos are attached.
                        // eslint-disable-next-line no-await-in-loop
                        next.push(await compressChatVideoAsset(f, {
                            isAborted,
                            onProgress: draftVideoContext?.onCompressProgress,
                        }));
                    } else {
                        next.push(f);
                    }
                }
                filesToExtract = next;
            } catch (e) {
                logError('[FilePickerUtil.prepareFileUpload] video compression batch failed', e);
                filesToExtract = files;
            } finally {
                if (shouldToggleVideoOverlay) {
                    await hideVideoCompressOverlay();
                }
            }
        }

        if (draftVideoContext && isDraftVideoProcessingAborted(draftVideoContext.clientId)) {
            return;
        }

        const out = await extractFileInfo(filesToExtract);

        if (draftVideoContext) {
            if (isDraftVideoProcessingAborted(draftVideoContext.clientId)) {
                return;
            }
            if (out.length > 0 && out[0]) {
                out[0].clientId = draftVideoContext.clientId;
                dismissBottomSheet();
                draftVideoContext.bridge.completeVideoProcessing(draftVideoContext.clientId, out);
            } else {
                draftVideoContext.bridge.removeVideoPlaceholder(draftVideoContext.clientId);
            }
            return;
        }

        if (out.length > 0) {
            dismissBottomSheet();
            this.uploadFiles(out);
        }
    };

    private getPermissionDeniedMessage = (source?: PermissionSource) => {
        const sources = ['camera', 'storage'];
        const deniedSource: PermissionSource = Platform.select({android: 'photo_android', ios: 'photo_ios'})!;
        const msgForSource = source && sources.includes(source) ? source : deniedSource;

        return this.getPermissionMessages(msgForSource);
    };

    private getFilesFromResponse = async (response: ImagePickerResponse): Promise<Asset[]> => {
        if (!response?.assets?.length) {
            logWarning('no assets in response');
            return [];
        }

        const files: Asset[] = [];

        await Promise.all((response.assets.map(async (file) => {
            if (Platform.OS === 'ios') {
                files.push(file);
            } else if (file.uri) {
                const uri = await RNUtils.getRealFilePath(file.uri);
                const type = file.type || lookupMimeType(uri);
                let fileName = file.fileName;
                if (type.includes('video/') && uri) {
                    fileName = safeDecodeURIComponent(uri.split('\\').pop()?.split('/').pop() || '');
                }

                if (uri) {
                    files.push({...file, fileName, uri, type, width: file.width, height: file.height});
                } else {
                    logWarning('attaching file reponse return empty uri', file);
                }
            }
        })));

        return files;
    };

    private hasPhotoPermission = async (source: PermissionSource) => {
        let permissionRequest;

        const targetSource = Platform.select({
            ios: source === 'camera' ? Permissions.PERMISSIONS.IOS.CAMERA : Permissions.PERMISSIONS.IOS.PHOTO_LIBRARY,
            default: Permissions.PERMISSIONS.ANDROID.CAMERA,
        });

        const hasPhotoLibraryPermission = await Permissions.check(targetSource);

        switch (hasPhotoLibraryPermission) {
            case Permissions.RESULTS.DENIED:
                permissionRequest = await Permissions.request(targetSource);
                return permissionRequest === Permissions.RESULTS.GRANTED;
            case Permissions.RESULTS.BLOCKED: {
                const grantOption = {
                    text: this.intl.formatMessage({
                        id: 'mobile.permission_denied_retry',
                        defaultMessage: 'Settings',
                    }),
                    onPress: () => Permissions.openSettings(),
                };

                const {title, text} = this.getPermissionDeniedMessage(source);

                Alert.alert(title, text, [
                    grantOption,
                    {
                        text: this.intl.formatMessage({
                            id: 'mobile.permission_denied_dismiss',
                            defaultMessage: "Don't Allow",
                        }),
                    },
                ]);
                return false;
            }
            default: return true;
        }
    };

    private hasStoragePermission = async () => {
        if (Platform.OS === 'android' && Platform.Version < 32) {
            const storagePermission = Permissions.PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE;
            let permissionRequest;
            const hasPermissionToStorage = await Permissions.check(storagePermission);
            switch (hasPermissionToStorage) {
                case Permissions.RESULTS.DENIED:
                    permissionRequest = await Permissions.request(storagePermission);
                    return permissionRequest === Permissions.RESULTS.GRANTED;
                case Permissions.RESULTS.BLOCKED: {
                    const {title, text} = this.getPermissionDeniedMessage();

                    Alert.alert(title, text, [
                        {
                            text: this.intl.formatMessage({
                                id: 'mobile.permission_denied_dismiss',
                                defaultMessage: "Don't Allow",
                            }),
                        },
                        {
                            text: this.intl.formatMessage({
                                id: 'mobile.permission_denied_retry',
                                defaultMessage: 'Settings',
                            }),
                            onPress: () => Linking.openSettings(),
                        },
                    ]);
                    return false;
                }
                default: return true;
            }
        }

        return true;
    };

    private hasWriteStoragePermission = async () => {
        if (Platform.OS === 'android' && Platform.Version <= 28) {
            const storagePermission = Permissions.PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE;
            let permissionRequest;
            const hasPermissionToStorage = await Permissions.check(storagePermission);
            switch (hasPermissionToStorage) {
                case Permissions.RESULTS.DENIED:
                    permissionRequest = await Permissions.request(storagePermission);
                    return permissionRequest === Permissions.RESULTS.GRANTED;
                case Permissions.RESULTS.BLOCKED: {
                    const {title, text} = this.getPermissionDeniedMessage('storage');

                    Alert.alert(title, text, [
                        {
                            text: this.intl.formatMessage({
                                id: 'mobile.permission_denied_dismiss',
                                defaultMessage: "Don't Allow",
                            }),
                        },
                        {
                            text: this.intl.formatMessage({
                                id: 'mobile.permission_denied_retry',
                                defaultMessage: 'Settings',
                            }),
                            onPress: () => Linking.openSettings(),
                        },
                    ]);
                    return false;
                }
                default: return true;
            }
        }

        return true;
    };

    private buildUri = async (doc: DocumentPickerResponse) => {
        let uri: string = doc.fileCopyUri || doc.uri;

        if (Platform.OS === 'android') {
            if (doc.fileCopyUri) {
                uri = doc.fileCopyUri;
            } else {
                // For android we need to retrieve the realPath in case the file being imported is from the cloud
                const newUri = await RNUtils.getRealFilePath(doc.uri);
                if (newUri == null) {
                    return {doc: undefined};
                }

                uri = newUri;
            }
        }

        doc.uri = uri;
        return {doc};
    };

    private visionVideoToAsset = (video: VideoFile): Asset => {
        const path = video.path;
        const uri = path.startsWith('file://') ? path : `file://${path}`;
        const ext = Platform.OS === 'ios' ? 'mov' : 'mp4';
        const mime = Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4';
        return {
            uri,
            type: mime,
            fileName: `chat-video-${Date.now()}.${ext}`,
            duration: video.duration,
            width: video.width,
            height: video.height,
        };
    };

    private advanceDraftVideoToCompressingAndUpload = async (
        clientId: string,
        initialPlaceholder: FileInfo,
        files: Asset[],
    ): Promise<void> => {
        if (!this.draftVideoBridge) {
            return;
        }
        let placeholderSnapshot = initialPlaceholder;
        const compressingLabel = this.intl.formatMessage({
            id: 'mobile.video_upload.compressing',
            defaultMessage: 'Compressing video…',
        });
        placeholderSnapshot = patchDraftVideoPlaceholder(placeholderSnapshot, {
            stage: 'compressing',
            progress: 0,
            name: compressingLabel,
        });
        await this.draftVideoBridge.updateVideoPlaceholder(clientId, placeholderSnapshot);
        reportVideoCompressOverlayMessage(compressingLabel);
        const onCompressProgress = (p: number) => {
            placeholderSnapshot = patchDraftVideoPlaceholder(placeholderSnapshot, {
                stage: 'compressing',
                progress: p,
            });
            void this.draftVideoBridge!.updateVideoPlaceholder(clientId, placeholderSnapshot);
        };
        await this.prepareFileUpload(files, true, {
            clientId,
            bridge: this.draftVideoBridge,
            onCompressProgress,
        });
    };

    private handleVisionCameraVideoRecorded = async (video: VideoFile) => {
        const asset = this.visionVideoToAsset(video);
        const progressLabel = this.intl.formatMessage({
            id: 'mobile.video_upload.progress_label',
            defaultMessage: 'Progress',
        });

        if (!this.draftVideoBridge) {
            if (this.fileLooksLikeVideo(asset)) {
                showVideoCompressOverlay(
                    this.intl.formatMessage({
                        id: 'mobile.video_upload.compressing',
                        defaultMessage: 'Compressing video…',
                    }),
                    progressLabel,
                );
            }
            try {
                await this.prepareFileUpload([asset], this.fileLooksLikeVideo(asset));
            } finally {
                if (this.fileLooksLikeVideo(asset)) {
                    await hideVideoCompressOverlay();
                }
            }
            return;
        }

        const clientId = generateId();
        clearDraftVideoProcessingAborted(clientId);
        const resolvingLabel = this.intl.formatMessage({
            id: 'mobile.video_upload.preparing_video',
            defaultMessage: 'Preparing video…',
        });
        let placeholderSnapshot = buildDraftVideoPlaceholderFile({
            clientId,
            userId: this.draftVideoBridge.currentUserId,
            name: resolvingLabel,
            stage: 'resolving',
            progress: 0,
        });
        this.draftVideoBridge.addVideoPlaceholder(placeholderSnapshot);
        showVideoCompressOverlay(resolvingLabel, progressLabel);
        reportVideoCompressProgress(0);
        try {
            if (isDraftVideoProcessingAborted(clientId)) {
                return;
            }
            await this.advanceDraftVideoToCompressingAndUpload(clientId, placeholderSnapshot, [asset]);
        } finally {
            await hideVideoCompressOverlay();
        }
    };

    /**
     * Photo-only or video without draft placeholder bridge (system camera fallback).
     */
    private handlePickedCameraAssetsWithoutDraftPlaceholder = async (files: Asset[]): Promise<void> => {
        const hasVideoAsset = files.some((asset) => this.fileLooksLikeVideo(asset));
        const progressLabel = this.intl.formatMessage({
            id: 'mobile.video_upload.progress_label',
            defaultMessage: 'Progress',
        });

        if (hasVideoAsset) {
            showVideoCompressOverlay(
                this.intl.formatMessage({
                    id: 'mobile.video_upload.compressing',
                    defaultMessage: 'Compressing video…',
                }),
                progressLabel,
            );
        }

        try {
            await this.prepareFileUpload(files, hasVideoAsset);
        } finally {
            if (hasVideoAsset) {
                await hideVideoCompressOverlay();
            }
        }
    };

    attachFileFromCamera = async (customOptions?: CameraOptions) => {
        let options = customOptions;
        if (!options) {
            options = {
                quality: 0.8,
                videoQuality: 'high',
                mediaType: 'photo',
                saveToPhotos: false,
            };
        }

        const hasCameraPermission = await this.hasPhotoPermission('camera');

        let hasWriteToStoragePermission = true;
        if (Platform.OS === 'android' && Platform.Version <= 28) {
            hasWriteToStoragePermission = await this.hasWriteStoragePermission();
        }

        if (hasCameraPermission && hasWriteToStoragePermission) {
            launchCamera(options, async (response: ImagePickerResponse) => {
                StatusBar.setHidden(false);

                if (response.errorCode || response.didCancel) {
                    return;
                }

                const hasVideoAsset = response.assets?.some((asset) => this.fileLooksLikeVideo(asset)) ?? false;
                const progressLabel = this.intl.formatMessage({
                    id: 'mobile.video_upload.progress_label',
                    defaultMessage: 'Progress',
                });

                if (hasVideoAsset && this.draftVideoBridge) {
                    const clientId = generateId();
                    clearDraftVideoProcessingAborted(clientId);
                    const resolvingLabel = this.intl.formatMessage({
                        id: 'mobile.video_upload.preparing_video',
                        defaultMessage: 'Preparing video…',
                    });
                    let placeholderSnapshot = buildDraftVideoPlaceholderFile({
                        clientId,
                        userId: this.draftVideoBridge.currentUserId,
                        name: resolvingLabel,
                        stage: 'resolving',
                        progress: 0,
                    });
                    this.draftVideoBridge.addVideoPlaceholder(placeholderSnapshot);
                    showVideoCompressOverlay(resolvingLabel, progressLabel);
                    reportVideoCompressProgress(0);
                    try {
                        const files = await this.getFilesFromResponse(response);
                        if (isDraftVideoProcessingAborted(clientId)) {
                            return;
                        }
                        if (!files.length) {
                            this.draftVideoBridge.removeVideoPlaceholder(clientId);
                            return;
                        }
                        await this.advanceDraftVideoToCompressingAndUpload(clientId, placeholderSnapshot, files);
                    } finally {
                        await hideVideoCompressOverlay();
                    }
                    return;
                }

                const files = await this.getFilesFromResponse(response);
                await this.handlePickedCameraAssetsWithoutDraftPlaceholder(files);
            });
        }
    };

    attachVideoFromVisionRecorder = async () => {
        const hasCameraPermission = await this.hasPhotoPermission('camera');

        let hasWriteToStoragePermission = true;
        if (Platform.OS === 'android' && Platform.Version <= 28) {
            hasWriteToStoragePermission = await this.hasWriteStoragePermission();
        }

        if (hasCameraPermission && hasWriteToStoragePermission) {
            showDraftVideoRecorderModal({
                onVideoRecorded: (video) => {
                    void this.handleVisionCameraVideoRecorded(video);
                },
            });
        }
    };

    attachFileFromFiles = async (browseFileType?: string, allowMultiSelection = false) => {
        const hasPermission = await this.hasStoragePermission();
        const fileType = browseFileType ?? Platform.select({ios: 'public.item', default: '*/*'});

        if (hasPermission) {
            try {
                const docResponse = (await DocumentPicker.pick({allowMultiSelection, type: [fileType], copyTo: 'cachesDirectory'}));
                const proDocs = docResponse.map(async (d: DocumentPickerResponse) => {
                    const {doc} = await this.buildUri(d);
                    return doc;
                });

                const docs = (await Promise.all(proDocs)).filter(
                    (item): item is DocumentPickerResponse => item !== undefined,
                );

                await this.prepareFileUpload(docs);
                return {error: undefined};
            } catch (error) {
                return {error};
            }
        }

        return {error: 'no permission'};
    };

    attachFileFromPhotoGallery = async (selectionLimit = 1) => {
        const options: ImageLibraryOptions = {
            quality: 1,
            mediaType: 'mixed',
            includeBase64: false,
            selectionLimit,
        };

        const hasPermission = await this.hasPhotoPermission('photo');
        if (hasPermission) {
            launchImageLibrary(options, async (response: ImagePickerResponse) => {
                StatusBar.setHidden(false);
                if (response.errorMessage || response.didCancel) {
                    logWarning('Attach failed', response.errorMessage || (response.didCancel ? 'cancelled' : ''));
                    return;
                }

                const files = await this.getFilesFromResponse(response);
                await this.prepareFileUpload(files);
            });
        }
    };
}
