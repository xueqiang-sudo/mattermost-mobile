#import "SecurePDFViewerManager.h"
#import <React/RCTBridge.h>
#import <React/RCTUIManager.h>

#if __has_include("secure_pdf_viewer-Swift.h")
#import "secure_pdf_viewer-Swift.h"
#else
#import <secure_pdf_viewer/secure_pdf_viewer-Swift.h>
#endif

#if RCT_NEW_ARCH_ENABLED
#import <React/RCTConversions.h>
#import <react/renderer/components/RNSecurePdfViewerSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNSecurePdfViewerSpec/EventEmitters.h>
#import <react/renderer/components/RNSecurePdfViewerSpec/Props.h>
#import <react/renderer/components/RNSecurePdfViewerSpec/RCTComponentViewHelpers.h>
#import <React/RCTComponentViewFactory.h>
#endif


@implementation SecurePDFViewerManager

RCT_EXPORT_MODULE(SecurePdfViewer)

RCT_EXPORT_VIEW_PROPERTY(source, NSString)
RCT_EXPORT_VIEW_PROPERTY(password, NSString)
RCT_EXPORT_VIEW_PROPERTY(allowLinks, BOOL)

RCT_EXPORT_VIEW_PROPERTY(onLinkPressed, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLinkPressedDisabled, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLoad, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPasswordRequired, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPasswordFailed, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onPasswordFailureLimitReached, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onLoadError, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onTap, RCTDirectEventBlock)

- (UIView *)view {
#if RCT_NEW_ARCH_ENABLED
  return [UIView new];
#else
  return [[SecurePdfViewerComponentView alloc] initWithFrame:CGRectZero];
#endif
}

@end

#if RCT_NEW_ARCH_ENABLED

Class<RCTComponentViewProtocol> SecurePdfViewerCls(void) {
  return SecurePdfViewerComponentView.class;
}

__attribute__((constructor)) static void registerSecurePdfViewer() {
  RCTRegisterComponentViewClass(SecurePdfViewerCls);
}

#endif
