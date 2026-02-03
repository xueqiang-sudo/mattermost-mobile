// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useRef, useState} from 'react';

import {useTheme} from '@context/theme';

interface CustomInputModalOptions {
    title: string;
    placeholder: string;
    defaultValue?: string;
    confirmContent?: string;
    showCancelButton?: boolean;
    cancelContent?: string;
}

interface UseCustomInputModalReturn {
    visible: boolean;
    options: CustomInputModalOptions;
    theme: Theme;
    showModal: (modalOptions: CustomInputModalOptions) => Promise<string | null>;
    handleConfirm: (value: string) => void;
    handleCancel: () => void;
}

export const useCustomInputModal = (): UseCustomInputModalReturn => {
    const theme = useTheme();
    const [visible, setVisible] = useState(false);
    const [options, setOptions] = useState<CustomInputModalOptions>({
        title: '',
        placeholder: '',
        defaultValue: '',
        confirmContent: 'Confirm',
        showCancelButton: true,
        cancelContent: 'Cancel',
    });
    const resolveRef = useRef<((value: string | null) => void) | null>(null);

    const showModal = useCallback((modalOptions: CustomInputModalOptions): Promise<string | null> => {
        return new Promise((resolvePromise) => {
            setOptions({
                title: modalOptions.title,
                placeholder: modalOptions.placeholder,
                defaultValue: modalOptions.defaultValue || '',
                confirmContent: modalOptions.confirmContent || 'Confirm',
                showCancelButton: modalOptions.showCancelButton ?? true,
                cancelContent: modalOptions.cancelContent || 'Cancel',
            });
            resolveRef.current = resolvePromise;
            setVisible(true);
        });
    }, []);

    const handleConfirm = useCallback((value: string) => {
        if (resolveRef.current) {
            resolveRef.current(value);
            resolveRef.current = null;
        }
        setVisible(false);
    }, []);

    const handleCancel = useCallback(() => {
        if (resolveRef.current) {
            resolveRef.current(null);
            resolveRef.current = null;
        }
        setVisible(false);
    }, []);

    return {
        visible,
        options,
        theme,
        showModal,
        handleConfirm,
        handleCancel,
    };
};
