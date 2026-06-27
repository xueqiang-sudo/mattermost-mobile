// Diagnostic accumulator — collects logs from multiple concurrent handlers
// and shows ONE alert after a delay, avoiding alert overlap.
import {Alert} from 'react-native';

const _buf: string[] = [];
let _timer: ReturnType<typeof setTimeout> | null = null;

export function diagLog(tag: string, lines: string[]) {
    _buf.push(`[${tag}]\n${lines.join('\n')}`);
    if (_timer) {
        clearTimeout(_timer);
    }
    _timer = setTimeout(() => {
        const msg = _buf.join('\n\n---\n\n');
        _buf.length = 0;
        _timer = null;
        Alert.alert('🔍 诊断汇总', msg);
    }, 5000);
}
