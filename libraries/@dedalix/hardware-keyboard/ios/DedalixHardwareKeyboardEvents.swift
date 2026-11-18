import Foundation

@objc public protocol DedalixHardwareKeyboardDelegate {
    func sendEvent(name: String, result: Dictionary<String, String>)
}

extension DedalixHardwareKeyboardWrapper {
    enum Event: String, CaseIterable {
        case mmHardwareKeyboardEvent
    }
    
    @objc public static var supportedEvents: [String] {
        return Event.allCases.map(\.rawValue)
    }
}
