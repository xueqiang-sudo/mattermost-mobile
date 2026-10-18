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

        // 确保目录存在
        try? FileManager.default.createDirectory(at: cachePath, withIntermediateDirectories: true, attributes: nil)
        return cachePath
    }

    /// 生成头像缓存文件路径
    private func cacheFileURL(for userId: String, updatedAt: Double, forServer serverUrl: String) -> URL? {
        guard let cacheDir = sharedCacheDirectory else { return nil }

        // 使用 serverUrl 作为子目录，避免不同服务器冲突
        let serverDir = serverUrl
            .replacingOccurrences(of: "https://", with: "")
            .replacingOccurrences(of: "http://", with: "")
            .replacingOccurrences(of: "/", with: "_")

        let serverPath = cacheDir.appendingPathComponent(serverDir, isDirectory: true)
        try? FileManager.default.createDirectory(at: serverPath, withIntermediateDirectories: true, attributes: nil)

        let fileName = "\(userId)_\(Int(updatedAt)).png"
        return serverPath.appendingPathComponent(fileName)
    }

    public func removeAllImages() {
        lock.lock(); defer { lock.unlock() }
        imageCache.removeAllObjects()
        keysCache.removeAllObjects()

        // 同时清理磁盘缓存
        if let cacheDir = sharedCacheDirectory {
            try? FileManager.default.removeItem(at: cacheDir)
            try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true, attributes: nil)
        }
    }

    public func insertImage(_ data: Data?, for userId: String, updatedAt: Double, forServer serverUrl: String ) {
        guard let data = data else {
            removeImage(for: userId, forServer: serverUrl)
            return
        }

        lock.lock(); defer { lock.unlock() }

        // 写入内存缓存
        let cacheKey = "\(serverUrl)-\(userId)" as NSString
        let imageKey = "\(cacheKey)-\(updatedAt)" as NSString
        imageCache.setObject(NSData(data: data), forKey: imageKey as NSString, cost: data.count)
        keysCache.setObject(imageKey, forKey: cacheKey)

        // 同时写入磁盘缓存（共享容器）
        if let fileURL = cacheFileURL(for: userId, updatedAt: updatedAt, forServer: serverUrl) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    public func removeImage(for userId: String, forServer serverUrl: String) {
        lock.lock(); defer { lock.unlock() }
        let cacheKey = "\(serverUrl)-\(userId)" as NSString
        if let key = keysCache.object(forKey: cacheKey) {
            keysCache.removeObject(forKey: cacheKey)
            imageCache.removeObject(forKey: key)

            // 同时删除磁盘缓存
            let parts = key.components(separatedBy: "-")
            if parts.count >= 2, let updatedAt = Double(parts.last ?? "") {
                if let fileURL = cacheFileURL(for: userId, updatedAt: updatedAt, forServer: serverUrl) {
                    try? FileManager.default.removeItem(at: fileURL)
                }
            }
        }
    }
}
