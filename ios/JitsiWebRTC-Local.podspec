# Local override: uses file:// to avoid network download when net-cache-resources/WebRTC.xcframework.zip exists
zip_path = File.expand_path(File.join(__dir__, '..', 'net-cache-resources', 'WebRTC.xcframework.zip'))

Pod::Spec.new do |s|
  s.name                = 'JitsiWebRTC'
  s.version             = '124.0.2'
  s.summary             = 'WebRTC build provided by Jitsi (local)'
  s.homepage            = 'https://github.com/jitsi/webrtc'
  s.license             = { :type => 'BSD' }
  s.authors             = 'The WebRTC project authors'
  s.source              = { :http => "file://#{zip_path}", :flatten => false }
  s.platforms           = { :ios => '12.0', :osx => '13.0' }
  s.vendored_frameworks = 'WebRTC.xcframework'
end
