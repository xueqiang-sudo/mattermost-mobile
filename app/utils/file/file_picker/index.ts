// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import RNUtils from '@mattermost/rnutils';
import {applicationName} from 'expo-application';
import {Alert, InteractionManager, Linking, Platform, StatusBar} from 'react-native';
import DocumentPicker, {type DocumentPickerResponse} from 'react-native-document-picker';
import {type Asset, type CameraOptions, type ImageLibraryOptions, type ImagePickerResponse, launchCamera, launchImageLibrary} from 'react-native-image-picker';
import Permissions from 'react-native-permissions';

import {ENABLE_IMAGE_COMPRESS, ENABLE_VIDEO_COMPRESS} from '@constants/media_processing';
import {showDraftVideoRecorderModal} from '@screens/draft_video_recorder/show_modal';
import {dismissBottomSheet} from '@screens/navigation';
import {extractFileInfo, getExtensionFromMime, lookupMimeType} from '@utils/file';
import {
    buildDraftMediaPlaceholderFile,
    clearDraftVideoProcessingAborted,
    isDraftVideoProcessingAborted,
    patchDraftVideoPlaceholder,
    type DraftVideoProcessingBridge,
} from '@utils/file/draft_video_local_processing';
import {compressChatImageAsset} from '@utils/file/compress_chat_image';
import {compressChatVideoAsset} from '@utils/file/compress_chat_video';
import {
    hideVideoCompressOverlay,
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

    private fileLooksLikeImage = (file: Asset | DocumentPickerResponse): boolean => {
        if (this.fileLooksLikeVideo(file)) {
            return false;
        }
        const mime = file.type || lookupMimeType(
            ('fileName' in file && file.fileName) ||
            ('name' in file && file.name) ||
            file.uri ||
            '',
        );
        if (mime.startsWith('image/')) {
            return true;
        }
        const name = ('fileName' in file && file.fileName) || ('name' in file && file.name) || '';
        const ext = name.split('.').pop()?.toLowerCase();
        return Boolean(ext && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff'].includes(ext));
    };

    private mediaExportMessages = () => ({
        exporting: this.intl.formatMessage({
            id: 'mobile.media_export.exporting',
            defaultMessage: 'Exporting…',
        }),
        preparing: this.intl.formatMessage({
            id: 'mobile.media_export.preparing',
            defaultMessage: 'Preparing…',
        }),
        progressLabel: this.intl.formatMessage({
            id: 'mobile.media_export.progress_label',
            defaultMessage: 'Progress',
        }),
    });

    /**
     * Runs optional native video/image compression then extractFileInfo.
     * Full-screen export UI is skipped when draftVideoContext is set (inline draft progress instead).
     *
     * Compression runs in native code (react-native-compressor); the JS thread only awaits and
     * forwards progress — keep placeholder/overlay updates light to avoid frame drops.
     */
    private prepareFileUpload = async (
        files: Array<Asset | DocumentPickerResponse>,
        draftVideoContext?: DraftVideoPrepareContext,
    ) => {
        await new Promise<void>((resolve) => {
            InteractionManager.runAfterInteractions(() => resolve());
        });

        const {exporting, progressLabel} = this.mediaExportMessages();
        const hasVideoFiles = files.some((f) => this.fileLooksLikeVideo(f));
        const needsVideoCompress = ENABLE_VIDEO_COMPRESS && hasVideoFiles;
        const hasImageFiles = files.some((f) => this.fileLooksLikeImage(f));
        const needsImageCompress = ENABLE_IMAGE_COMPRESS && hasImageFiles;
        const showExportOverlay = !draftVideoContext && (needsVideoCompress || needsImageCompress);

        let exportOverlayShown = false;
        let filesToExtract = files;
        if (showExportOverlay) {
            showVideoCompressOverlay(exporting, progressLabel);
            exportOverlayShown = true;
        }

        const hideExportOverlayIfNeeded = async () => {
            if (!exportOverlayShown) {
                return;
            }
            exportOverlayShown = false;
            await hideVideoCompressOverlay();
        };

        try {
            if (needsVideoCompress) {
                try {
                    const next: Array<Asset | DocumentPickerResponse> = [];
                    for (const f of filesToExtract) {
                        if (this.fileLooksLikeVideo(f)) {
                            const clientId = draftVideoContext?.clientId;
                            const isAborted = clientId ? () => isDraftVideoProcessingAborted(clientId) : undefined;
                            // Sequential compression avoids high memory use when multiple large videos are attached.
                            // eslint-disable-next-line no-await-in-loop
                            next.push(await compressChatVideoAsset(f, {
                                isAborted,
                                onProgress: draftVideoContext?.onCompressProgress,
                            }));
                            await new Promise<void>((r) => setImmediate(r));
                        } else {
                            next.push(f);
                        }
                    }
                    filesToExtract = next;
                } catch (e) {
                    logError('[FilePickerUtil.prepareFileUpload] video compression batch failed', e);
                }
            }

            if (draftVideoContext && isDraftVideoProcessingAborted(draftVideoContext.clientId)) {
                return;
            }

            if (needsImageCompress) {
                try {
                    const next: Array<Asset | DocumentPickerResponse> = [];
                    for (const f of filesToExtract) {
                        if (this.fileLooksLikeImage(f)) {
                            const clientId = draftVideoContext?.clientId;
                            const isAborted = clientId ? () => isDraftVideoProcessingAborted(clientId) : undefined;
                            // eslint-disable-next-line no-await-in-loop
                            next.push(await compressChatImageAsset(f, {
                                isAborted,
                                onProgress: draftVideoContext?.onCompressProgress,
                            }));
                            await new Promise<void>((r) => setImmediate(r));
                        } else {
                            next.push(f);
                        }
                    }
                    filesToExtract = next;
                } catch (e) {
                    logError('[FilePickerUtil.prepareFileUpload] image compression batch failed', e);
                }
            }

            if (draftVideoContext && isDraftVideoProcessingAborted(draftVideoContext.clientId)) {
                return;
            }

            await new Promise<void>((resolve) => {
                InteractionManager.runAfterInteractions(() => resolve());
            });
            const out = await extractFileInfo(filesToExtract);

            if (draftVideoContext) {
                if (isDraftVideoProcessingAborted(draftVideoContext.clientId)) {
                    return;
                }
                if (out.length > 0 && out[0]) {
                    await hideExportOverlayIfNeeded();
                    out[0].clientId = draftVideoContext.clientId;
                    dismissBottomSheet();
                    draftVideoContext.bridge.completeVideoProcessing(draftVideoContext.clientId, out);
                } else {
                    draftVideoContext.bridge.removeVideoPlaceholder(draftVideoContext.clientId);
                }
                return;
            }

            if (out.length > 0) {
                await hideExportOverlayIfNeeded();
                dismissBottomSheet();
                this.uploadFiles(out);
            }
        } finally {
            await hideExportOverlayIfNeeded();
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

    private documentPickerResponseToAsset = (doc: DocumentPickerResponse): Asset => {
        const uri = doc.uri;
        return {
            uri,
            type: doc.type || lookupMimeType(uri) || undefined,
            fileName: doc.name || undefined,
        };
    };

    private buildPlaceholderFromAsset = (
        asset: Asset,
        clientId: string,
        userId: string,
        preparingLabel: string,
    ): FileInfo => {
        const rawUri = asset.uri || '';
        const mime = asset.type || lookupMimeType(rawUri) || 'application/octet-stream';
        const fromName = asset.fileName?.split('.').pop()?.toLowerCase();
        const ext = fromName || getExtensionFromMime(mime) || 'jpg';
        return buildDraftMediaPlaceholderFile({
            clientId,
            userId,
            name: preparingLabel,
            stage: 'resolving',
            progress: 0,
            mime_type: mime,
            extension: ext,
            uri: rawUri || undefined,
        });
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
        const {exporting, preparing} = this.mediaExportMessages();
        const willCompressVideo = ENABLE_VIDEO_COMPRESS && files.some((f) => this.fileLooksLikeVideo(f));
        const willCompressImage = ENABLE_IMAGE_COMPRESS && files.some((f) => this.fileLooksLikeImage(f));
        const busyCompressing = willCompressVideo || willCompressImage;
        placeholderSnapshot = patchDraftVideoPlaceholder(placeholderSnapshot, {
            stage: busyCompressing ? 'compressing' : 'resolving',
            progress: 0,
            name: busyCompressing ? exporting : preparing,
        });
        await this.draftVideoBridge.updateVideoPlaceholder(clientId, placeholderSnapshot);

        let lastProgressEmitAt = 0;
        let lastProgressValue = -1;
        const onCompressProgress = (p: number) => {
            const clamped = Math.min(1, Math.max(0, p));
            const now = Date.now();
            const isFinal = clamped >= 0.99;
            if (
                !isFinal &&
                now - lastProgressEmitAt < 170 &&
                Math.abs(clamped - lastProgressValue) < 0.05
            ) {
                return;
            }
            lastProgressEmitAt = now;
            lastProgressValue = clamped;
            placeholderSnapshot = patchDraftVideoPlaceholder(placeholderSnapshot, {
                stage: busyCompressing ? 'compressing' : 'resolving',
                progress: clamped,
            });
            this.draftVideoBridge!.updateVideoPlaceholder(clientId, placeholderSnapshot).catch(() => undefined);
        };
        await this.prepareFileUpload(files, {
            clientId,
            bridge: this.draftVideoBridge,
            onCompressProgress,
        });
    };

    /**
     * One placeholder at a time: avoids overlapping compress/extract on the same draft row and
     * keeps addFilesToDraft ordering predictable.
     */
    private processPickedAssetsWithDraftBridge = async (picked: Asset[]): Promise<void> => {
        if (!this.draftVideoBridge || !picked.length) {
            return;
        }
        const preparingLabel = this.mediaExportMessages().preparing;
        for (const asset of picked) {
            const clientId = generateId();
            clearDraftVideoProcessingAborted(clientId);
            const placeholderSnapshot = this.buildPlaceholderFromAsset(
                asset,
                clientId,
                this.draftVideoBridge.currentUserId,
                preparingLabel,
            );
            this.draftVideoBridge.addVideoPlaceholder(placeholderSnapshot);
            if (isDraftVideoProcessingAborted(clientId)) {
                return;
            }
            // eslint-disable-next-line no-await-in-loop
            await this.advanceDraftVideoToCompressingAndUpload(clientId, placeholderSnapshot, [asset]);
        }
    };

    private handleVisionCameraVideoRecorded = async (video: VideoFile) => {
        const asset = this.visionVideoToAsset(video);

        if (!this.draftVideoBridge) {
            await this.prepareFileUpload([asset]);
            return;
        }

        const clientId = generateId();
        clearDraftVideoProcessingAborted(clientId);
        const preparingLabel = this.mediaExportMessages().preparing;
        const placeholderSnapshot = buildDraftMediaPlaceholderFile({
            clientId,
            userId: this.draftVideoBridge.currentUserId,
            name: preparingLabel,
            stage: 'resolving',
            progress: 0,
            mime_type: asset.type || 'video/mp4',
            extension: Platform.OS === 'ios' ? 'mov' : 'mp4',
            uri: asset.uri,
        });
        this.draftVideoBridge.addVideoPlaceholder(placeholderSnapshot);
        if (isDraftVideoProcessingAborted(clientId)) {
            return;
        }
        await this.advanceDraftVideoToCompressingAndUpload(clientId, placeholderSnapshot, [asset]);
    };

    /**
     * Photo-only or video without draft placeholder bridge (system camera fallback).
     */
    private handlePickedCameraAssetsWithoutDraftPlaceholder = async (files: Asset[]): Promise<void> => {
        await this.prepareFileUpload(files);
    };

    attachFileFromCamera = async (customOptions?: CameraOptions) => {
        let options = customOptions;
        if (!options) {
            options = {
                quality: ENABLE_IMAGE_COMPRESS ? 0.8 : 1,
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

                const files = await this.getFilesFromResponse(response);
                if (!files.length) {
                    return;
                }

                if (hasVideoAsset && this.draftVideoBridge) {
                    const clientId = generateId();
                    clearDraftVideoProcessingAborted(clientId);
                    const preparingLabel = this.mediaExportMessages().preparing;
                    const first = files[0]!;
                    const placeholderSnapshot = this.buildPlaceholderFromAsset(
                        first,
                        clientId,
                        this.draftVideoBridge.currentUserId,
                        preparingLabel,
                    );
                    this.draftVideoBridge.addVideoPlaceholder(placeholderSnapshot);
                    if (isDraftVideoProcessingAborted(clientId)) {
                        return;
                    }
                    await this.advanceDraftVideoToCompressingAndUpload(clientId, placeholderSnapshot, files);
                    return;
                }

                if (this.draftVideoBridge) {
                    await this.processPickedAssetsWithDraftBridge(files);
                    return;
                }

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
                    Promise.resolve(this.handleVisionCameraVideoRecorded(video)).catch(() => undefined);
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

                if (!docs.length) {
                    return {error: undefined};
                }

                if (this.draftVideoBridge) {
                    const assets = docs.map((d) => this.documentPickerResponseToAsset(d));
                    await this.processPickedAssetsWithDraftBridge(assets);
                    return {error: undefined};
                }

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
            quality: ENABLE_IMAGE_COMPRESS ? 0.8 : 1,
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
                if (!files.length) {
                    return;
                }

                if (this.draftVideoBridge) {
                    await this.processPickedAssetsWithDraftBridge(files);
                    return;
                }

                await this.prepareFileUpload(files);
            });
        }
    };
}
