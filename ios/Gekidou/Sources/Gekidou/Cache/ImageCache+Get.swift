import Foundation

extension ImageCache {
    /// 获取共享容器中的头像缓存目录
    private var sharedCacheDirectory: URL? {
        guard let appGroupId = Bundle.main.infoDictionary?["AppGroupIdentifier"] as? String,
              let containerUrl = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId) else {
            return nil
        }

        let cachePath = containerUrl
            .appendingPathComponent("Library", isDirectory: true)
            .appendingPathComponent("Caches", isDirectory: true)
            .appendingPathComponent("ProfilePictures", isDirectory: true)

        return cachePath
    }

    /// 生成头像缓存文件路径
    private func cacheFileURL(for userId: String, updatedAt: Double, forServer serverUrl: String) -> URL? {
        guard let cacheDir = sharedCacheDirectory else { return nil }

        let serverDir = serverUrl
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
            .replacingOccurrences(of: "/", with: "_")

        let serverPath = cacheDir.appendingPathComponent(serverDir, isDirectory: true)
        let fileName = "\(userId)_\(Int(updatedAt)).png"
        return serverPath.appendingPathComponent(fileName)
    }

    public func image(for userId: String, updatedAt: Double, forServer serverUrl: String) -> Data? {
        lock.lock(); defer { lock.unlock() }

        // 1. 首先尝试从内存缓存读取
        let key = "\(serverUrl)-\(userId)-\(updatedAt)" as NSString
        if let image = imageCache.object(forKey: key) as? Data {
            return image
        }

        // 2. 内存缓存未命中，尝试从磁盘缓存读取（共享容器）
        if let fileURL = cacheFileURL(for: userId, updatedAt: updatedAt, forServer: serverUrl),
           let data = try? Data(contentsOf: fileURL) {
            // 写入内存缓存以供后续快速访问
            imageCache.setObject(NSData(data: data), forKey: key, cost: data.count)
            keysCache.setObject(key, forKey: "\(serverUrl)-\(userId)" as NSString)
            return data
        }

        return nil
    }
}
