import Foundation

/// Numerical *sampling* horizon, not a statement that medication has been
/// eliminated or is safe after this time. Keep the complete journal on disk
/// and in the cloud; only the temporary computation input is truncated.
enum PKResidualWindow {
    // 44 modeled half-lives leaves 2^-44 of a post-peak contribution.
    // Even an extreme 10,000 x 1,000,000 mg history has <= ~0.00057 mg of
    // equivalent tail after the modeled peak (subject to this model's laws).
    static let modeledHalfLives = 44.0

    static func hours(drug: PKDrug, model: PKModel) -> Double {
        guard drug.canCalculate, let tmax = drug.tmax, let baseHalf = drug.halfLife,
              tmax.isFinite, baseHalf.isFinite, baseHalf > 0 else { return .infinity }
        let effective = model.effectiveHalfLife(drug)
        guard effective.isFinite, effective > 0 else { return .infinity }
        let baseKe = log(2) / baseHalf
        var slowest = effective
        let food = model.catalog.food[drug.id]?.fed
        let shapes = [tmax] + (food?.parts.map(\.tmax) ?? []) +
                     (food?.highFat?.parts.map(\.tmax) ?? [])
        for absorptionPeak in shapes where absorptionPeak.isFinite && absorptionPeak > 0 {
            let ka = PKModel.kaFor(tmax: absorptionPeak, ke: baseKe)
            guard ka.isFinite, ka > 0 else { return .infinity }
            slowest = max(slowest, log(2) / ka)
        }
        // The website's equivalent contribution searches its peak in a
        // bounded interval. Include that whole peak search + the slowest tail.
        let modeledPeakHorizon = min(72, max(12, tmax * 8, effective * 3))
        return modeledPeakHorizon + modeledHalfLives * slowest
    }

    static func start(drug: PKDrug, model: PKModel, earliestSample: Date) -> Date {
        let duration = hours(drug: drug, model: model)
        guard duration.isFinite, duration > 0 else { return .distantPast }
        return earliestSample.addingTimeInterval(-duration * 3600)
    }

    static func forCalculation(model: PKModel, drug: PKDrug,
                               from start: Date, through end: Date) -> PKModel {
        let lower = self.start(drug: drug, model: model, earliestSample: start)
        let doses = model.doses.filter { $0.drug == drug.id && $0.time >= lower && $0.time <= end }
        let foodBefore = (model.catalog.food[drug.id]?.mealWindowMinutes ?? 90) * 60
        let meals = model.intakes.filter {
            ($0.kind == "meal" || $0.kind == "drink") &&
            $0.time >= lower.addingTimeInterval(-foodBefore) &&
            $0.time <= end.addingTimeInterval(15*60)
        }
        return PKModel(catalog: model.catalog, doses: doses, intakes: meals,
                       renalCrCl: model.renalCrCl, engineSource: model.engineSource)
    }
}
