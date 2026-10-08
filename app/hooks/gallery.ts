// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {useCallback} from 'react';

export function useGalleryItem(
    identifier: string,
    index: number,
    onPress: (identifier: string, itemIndex: number) => void,
) {
    const onGestureEvent = useCallback(() => {
        onPress(identifier, index);
    }, [identifier, index, onPress]);

    return {
        ref: null,
        styles: {},
        onGestureEvent,
    };
}
