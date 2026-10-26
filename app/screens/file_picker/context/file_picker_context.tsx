// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {createContext, useContext, useReducer, useEffect, type ReactNode} from 'react';
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
};

type SelectionAction =
    | {type: 'ADD_FILE'; file: SelectedFile}
    | {type: 'REMOVE_FILE'; fileId: string}
    | {type: 'CLEAR_SELECTION'}
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
    maxSelection: 9,
};

function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
    switch (action.type) {
        case 'ADD_FILE': {
            debugLog('FilePickerContext', `ADD_FILE: ${action.file.name || 'unnamed'}`, JSON.stringify({
                fileId: action.file.id,
                clientId: action.file.clientId,
                uri: action.file.uri,
                currentCount: state.selectedFiles.size,
                maxSelection: state.maxSelection,
            }));
            if (state.selectedFiles.size >= state.maxSelection) {
                debugLog('FilePickerContext', 'ADD_FILE rejected: max selection reached');
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
            newMap.set(mapKey, action.file);
            debugLog('FilePickerContext', `ADD_FILE success: new count = ${newMap.size}`, JSON.stringify({mapKey}));
            return {...state, selectedFiles: newMap};
        }
        case 'REMOVE_FILE': {
            debugLog('FilePickerContext', `REMOVE_FILE: ${action.fileId}`, JSON.stringify({
                currentCount: state.selectedFiles.size,
            }));
            const file = state.selectedFiles.get(action.fileId);
            const newMap = new Map(state.selectedFiles);
            newMap.delete(action.fileId);
            debugLog('FilePickerContext', `REMOVE_FILE success: new count = ${newMap.size}`);

            // Clean up cached file if it was from album
            if (file?.source === 'album' && file.uri?.includes('cache')) {
                deleteAsync(file.uri).catch((err) => {
                    debugLog('FilePickerContext', `Failed to delete cached file: ${err instanceof Error ? err.message : String(err)}`);
                });
            }

            return {...state, selectedFiles: newMap};
        }
        case 'CLEAR_SELECTION': {
            debugLog('FilePickerContext', 'CLEAR_SELECTION');

            // Clean up all cached album files
            state.selectedFiles.forEach((file) => {
                if (file.source === 'album' && file.uri?.includes('cache')) {
                    deleteAsync(file.uri).catch((err) => {
                        debugLog('FilePickerContext', `Failed to delete cached file: ${err instanceof Error ? err.message : String(err)}`);
                    });
                }
            });

            return {...state, selectedFiles: new Map()};
        }
        case 'SET_MAX_SELECTION':
            debugLog('FilePickerContext', `SET_MAX_SELECTION: ${action.max}`);
            return {...state, maxSelection: action.max};
        default:
            debugLog('FilePickerContext', `Unknown action: ${action.type}`);
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

    // Cleanup cached files when component unmounts
    useEffect(() => {
        return () => {
            debugLog('FilePickerContext', 'Component unmounting, cleaning up cached files');
            state.selectedFiles.forEach((file) => {
                if (file.source === 'album' && file.uri?.includes('cache')) {
                    deleteAsync(file.uri).catch((err) => {
                        debugLog('FilePickerContext', `Failed to delete cached file on unmount: ${err instanceof Error ? err.message : String(err)}`);
                    });
                }
            });
        };
    }, [state.selectedFiles]);

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
