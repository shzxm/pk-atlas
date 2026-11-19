#import <Foundation/Foundation.h>
#import <HealthKit/HealthKit.h>

NS_ASSUME_NONNULL_BEGIN
/// Public HealthKit API protected against synchronous ObjC NSException on
/// unsupported/incorrectly re-signed HealthKit entitlements. Swift do/catch
/// cannot catch ObjC exceptions.
@interface PKHealthExceptionShield : NSObject
+ (BOOL)requestMedicationReadAccess:(HKHealthStore *)store
                            forType:(HKObjectType *)type
                         completion:(void (^)(BOOL success, NSError * _Nullable error))completion
                              error:(NSError * _Nullable * _Nullable)error API_AVAILABLE(ios(26.0));
@end
NS_ASSUME_NONNULL_END
