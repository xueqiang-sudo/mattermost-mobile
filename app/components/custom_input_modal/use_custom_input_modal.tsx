// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback, useRef, useState} from 'react';
import {useIntl} from 'react-intl';

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

const DEFAULT_CONFIRM = {id: 'common.confirm', defaultMessage: 'Confirm'};
const DEFAULT_CANCEL = {id: 'common.cancel', defaultMessage: 'Cancel'};

export const useCustomInputModal = (): UseCustomInputModalReturn => {
    const theme = useTheme();
    const intl = useIntl();
    const [visible, setVisible] = useState(false);
    const [options, setOptions] = useState<CustomInputModalOptions>({
        title: '',
        placeholder: '',
        defaultValue: '',
        confirmContent: intl.formatMessage(DEFAULT_CONFIRM),
        showCancelButton: true,
        cancelContent: intl.formatMessage(DEFAULT_CANCEL),
    });
    const resolveRef = useRef<((value: string | null) => void) | null>(null);

    const showModal = useCallback((modalOptions: CustomInputModalOptions): Promise<string | null> => {
        return new Promise((resolvePromise) => {
            setOptions({
                title: modalOptions.title,
                placeholder: modalOptions.placeholder,
                defaultValue: modalOptions.defaultValue || '',
                confirmContent: modalOptions.confirmContent || intl.formatMessage(DEFAULT_CONFIRM),
                showCancelButton: modalOptions.showCancelButton ?? true,
                cancelContent: modalOptions.cancelContent || intl.formatMessage(DEFAULT_CANCEL),
            });
            resolveRef.current = resolvePromise;
            setVisible(true);
        });
    }, [intl]);

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
