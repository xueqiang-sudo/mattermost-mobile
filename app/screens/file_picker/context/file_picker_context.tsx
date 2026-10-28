// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {createContext, useContext, useReducer, useEffect, useRef, type ReactNode} from 'react';
import {deleteAsync} from 'expo-file-system';
import {debugLog} from '@store/debug_log';

import type {FileInfo} from '@mattermost/types/files';

export type SelectedFile = FileInfo & {
    source: 'channel' | 'album' | 'device';
    // For album photos: the original camera-roll URI. We key the selection
    // map by this so that `isFileSelected(originalUri)` works in the UI even
    // after the photo has been copied to the cache directory for upload.
    originalUri?: string;
};

type SelectionState = {
    selectedFiles: Map<string, SelectedFile>;
    maxSelection: number;
    // 文件已交付给上传流程（点发送后）。置位后卸载清理不再删缓存文件，
    // 否则相册图片的缓存文件会在后台上传前被删，导致上传失败。
    handedOff: boolean;
};

type SelectionAction =
    | {type: 'ADD_FILE'; file: SelectedFile}
    | {type: 'REMOVE_FILE'; fileId: string}
    | {type: 'CLEAR_SELECTION'}
    | {type: 'MARK_HANDED_OFF'}
    | {type: 'SET_MAX_SELECTION'; max: number};

type FilePickerContextType = {
    state: SelectionState;
    dispatch: React.Dispatch<SelectionAction>;
    isFileSelected: (fileId: string) => boolean;
    getSelectedCount: () => number;
    canSelectMore: () => boolean;
    getSelectedFiles: () => SelectedFile[];
};

const initialState: SelectionState = {
    selectedFiles: new Map(),
    handedOff: false,
    maxSelection: 9,
};

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
    switch (action.type) {
        case 'ADD_FILE': {
            debugLog('FilePickerContext', `=== ADD_FILE START ===`);
            debugLog('FilePickerContext', `File: ${action.file.name || 'unnamed'}`, JSON.stringify({
                fileId: action.file.id,
                clientId: action.file.clientId,
                uri: action.file.uri,
                source: action.file.source,
                currentCount: state.selectedFiles.size,
                maxSelection: state.maxSelection,
            }));

            // Validate required fields.
            // 云盘/频道文件是服务器已有文件（有真实 id+post_id，无本地 uri），
            // 发送时走服务器端复制流程，不需要本地 uri；只有本地待上传文件才强制要求 uri。
            const isExistingServerFile =
                action.file.source === 'channel' ||
                (Boolean(action.file.post_id) && Boolean(action.file.id) && !action.file.id.startsWith('pending_'));
            if (!action.file.uri && !isExistingServerFile) {
                debugLog('FilePickerContext', `ERROR: ADD_FILE rejected - missing uri`);
                return state;
            }
            if (!action.file.name) {
                debugLog('FilePickerContext', `WARNING: ADD_FILE - file has no name`);
            }

            if (state.selectedFiles.size >= state.maxSelection) {
                debugLog('FilePickerContext', `ERROR: ADD_FILE rejected - max selection reached (${state.selectedFiles.size}/${state.maxSelection})`);
                return state;
            }

            const newMap = new Map(state.selectedFiles);
            // Album photos are keyed by originalUri so isFileSelected(photoUri)
            // matches against the camera-roll URI the grid renders with. Other
            // sources keep their existing keying.
            const mapKey =
                (action.file.source === 'album' && action.file.originalUri)
                    ? action.file.originalUri
                    : (action.file.id || action.file.clientId || String(Date.now()));

            debugLog('FilePickerContext', `ADD_FILE using mapKey: ${mapKey}`);

            newMap.set(mapKey, action.file);
            debugLog('FilePickerContext', `ADD_FILE success: new count = ${newMap.size}/${state.maxSelection}`);
            return {...state, selectedFiles: newMap};
        }
        case 'REMOVE_FILE': {
            debugLog('FilePickerContext', `=== REMOVE_FILE ===`);
            debugLog('FilePickerContext', `FileId: ${action.fileId}`, JSON.stringify({
                currentCount: state.selectedFiles.size,
            }));

            const file = state.selectedFiles.get(action.fileId);
            const newMap = new Map(state.selectedFiles);
            newMap.delete(action.fileId);
            debugLog('FilePickerContext', `REMOVE_FILE success: new count = ${newMap.size}`);

            // Clean up cached file if it was from album
            if (file?.source === 'album' && file.uri?.includes('cache')) {
                debugLog('FilePickerContext', `Cleaning up cached album file: ${file.uri}`);
                deleteAsync(file.uri).catch((err) => {
                    debugLog('FilePickerContext', `WARNING: Failed to delete cached file: ${err instanceof Error ? err.message : String(err)}`);
                });
            }

            return {...state, selectedFiles: newMap};
        }
        case 'CLEAR_SELECTION': {
            debugLog('FilePickerContext', `=== CLEAR_SELECTION ===`);

            // Clean up all cached album files
            state.selectedFiles.forEach((file) => {
                if (file.source === 'album' && file.uri?.includes('cache')) {
                    debugLog('FilePickerContext', `Cleaning up cached album file: ${file.uri}`);
                    deleteAsync(file.uri).catch((err) => {
                        debugLog('FilePickerContext', `WARNING: Failed to delete cached file: ${err instanceof Error ? err.message : String(err)}`);
                    });
                }
            });

            return {...state, selectedFiles: new Map()};
        }
        case 'MARK_HANDED_OFF':
            debugLog('FilePickerContext', `MARK_HANDED_OFF: skip cache cleanup for ${state.selectedFiles.size} files`);
            return {...state, handedOff: true};
        case 'SET_MAX_SELECTION':
            debugLog('FilePickerContext', `SET_MAX_SELECTION: ${action.max}`);
            return {...state, maxSelection: action.max};
        default:
            debugLog('FilePickerContext', `WARNING: Unknown action: ${action.type}`);
            return state;
    }
}

const FilePickerContext = createContext<FilePickerContextType | undefined>(undefined);

type FilePickerProviderProps = {
    children: ReactNode;
    maxSelection?: number;
};

export function FilePickerProvider({children, maxSelection = 9}: FilePickerProviderProps) {
    const [state, dispatch] = useReducer(selectionReducer, {
        ...initialState,
        maxSelection,
    });

    // Cleanup cached files when component unmounts.
    // 已交付上传（handedOff）时不删：后台上传仍需读取这些缓存文件。
    //
    // 用 ref 持有最新 state，effect 依赖置空，确保 cleanup 只在「真正卸载」时
    // 执行一次，且读到的是最新的 handedOff/selectedFiles。
    // 若依赖里放 state.selectedFiles/state.handedOff，则每次选择变化或
    // MARK_HANDED_OFF 都会先用「上一次渲染的过期闭包值」触发 cleanup，把相册
    // 缓存文件在上传前误删，导致后台上传读不到文件而崩溃。
    const stateRef = useRef(state);
    stateRef.current = state;
    useEffect(() => {
        return () => {
            const latest = stateRef.current;
            if (latest.handedOff) {
                debugLog('FilePickerContext', 'Component unmounting, files handed off to upload - skip cleanup');
                return;
            }
            debugLog('FilePickerContext', 'Component unmounting, cleaning up cached files');
            latest.selectedFiles.forEach((file) => {
                if (file.source === 'album' && file.uri?.includes('cache')) {
                    deleteAsync(file.uri).catch((err) => {
                        debugLog('FilePickerContext', `Failed to delete cached file on unmount: ${err instanceof Error ? err.message : String(err)}`);
                    });
                }
            });
        };
    }, []);

    const isFileSelected = (fileId: string): boolean => {
        return state.selectedFiles.has(fileId);
    };

    const getSelectedCount = (): number => {
        return state.selectedFiles.size;
    };

    const canSelectMore = (): boolean => {
        return state.selectedFiles.size < state.maxSelection;
    };

    const getSelectedFiles = (): SelectedFile[] => {
        const files = Array.from(state.selectedFiles.values());
        debugLog('FilePickerContext', `getSelectedFiles: returning ${files.length} files`, {
            files: files.map(f => ({
                name: f.name,
                id: f.id,
                uri: f.uri,
                source: f.source,
                extension: f.extension,
                mime_type: f.mime_type,
                size: f.size,
            })),
        });
        return files;
    };

    return (
        <FilePickerContext.Provider
            value={{
                state,
                dispatch,
                isFileSelected,
                getSelectedCount,
                canSelectMore,
                getSelectedFiles,
            }}
        >
            {children}
        </FilePickerContext.Provider>
    );
}

export function useFilePicker() {
    const context = useContext(FilePickerContext);
    if (!context) {
        throw new Error('useFilePicker must be used within a FilePickerProvider');
    }
    return context;
}
