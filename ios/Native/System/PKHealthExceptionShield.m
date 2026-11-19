#import "PKHealthExceptionShield.h"

@implementation PKHealthExceptionShield
+ (BOOL)requestMedicationReadAccess:(HKHealthStore *)store
                            forType:(HKObjectType *)type
                         completion:(void (^)(BOOL, NSError * _Nullable))completion
                              error:(NSError * _Nullable * _Nullable)error {
    @try {
        [store requestPerObjectReadAuthorizationForType:type predicate:nil completion:completion];
        return YES;
    } @catch (NSException *exception) {
        if (error) {
            // Do not forward arbitrary NSException userInfo or private health data.
            NSString *reason = exception.reason ?: @"HealthKit rejected this request";
            *error = [NSError errorWithDomain:@"PKAtlas.HealthKit.Authorization"
                                         code:101
                                     userInfo:@{NSLocalizedDescriptionKey:
                         [NSString stringWithFormat:@"HealthKit 无法申请药物读取权限（%@）。请检查重新签名时是否保留 HealthKit capability。", reason]}];
        }
        return NO;
    }
}
@end
