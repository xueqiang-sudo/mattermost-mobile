/**
 * 模块级缓存：绕过 react-native-navigation passProps 序列化丢失复杂对象的问题。
 * 调用方在 goToScreen 前将 employee 存入缓存，employee_profile 组件从缓存中读取。
 */
const cache = new Map<string, UserProfile>();

export function setCachedEmployee(key: string, employee: UserProfile): void {
    cache.set(key, employee);
}

export function getCachedEmployee(key: string): UserProfile | undefined {
    return cache.get(key);
}

export function removeCachedEmployee(key: string): void {
    cache.delete(key);
}
