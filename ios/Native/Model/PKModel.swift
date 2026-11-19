import Foundation

// Native port of the active 181 server's frontend/03_model.js and shared/catalog.json.
// Population pharmacokinetic demonstration. Not measured blood concentration or treatment advice.
struct PKCatalog: Codable {
    var drugs: [PKDrug]
    var food: [String: PKFoodInfo]

    static func bundled() -> PKCatalog {
        guard let url = Bundle.main.url(forResource: "drug-catalog", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let value = try? JSONDecoder().decode(PKCatalog.self, from: data) else {
            // We do not silently invent pharmacokinetic constants.
            return PKCatalog(drugs: [], food: [:])
        }
        return value
    }
}

struct PKDrug: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var en: String?
    var kind: String?
    var refDose: Double?
    var cmax: Double?
    var cmaxRange: String?
    var tmax: Double?
    var tmaxRange: String?
    var halfLife: Double?
    var defaultDose: Double?
    var form: String?
    var note: String?
    var source: String?
    var url: String?
    var recordOnly: Bool?

    var canCalculate: Bool {
        recordOnly != true && (refDose ?? 0) > 0 &&
        (cmax ?? 0) > 0 && (tmax ?? 0) > 0 && (halfLife ?? 0) > 0
    }
    static func == (lhs: PKDrug, rhs: PKDrug) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct PKFoodPart: Codable {
    let tmax: Double
    let weight: Double
}
struct PKFedVariant: Codable {
    let parts: [PKFoodPart]
    var aucRatio: Double?
    var highFat: PKHighFatVariant?
    var observedTmax: String?
    var observedPeak: String?
}
struct PKHighFatVariant: Codable {
    let parts: [PKFoodPart]
    var aucRatio: Double?
}
struct PKFoodInfo: Codable {
    var summary: String?
    var drink: String?
    var url: String?
    var source: String?
    var fed: PKFedVariant?
    var mealWindowMinutes: Double?
}

struct PKDose: Identifiable, Hashable {
    var id: String
    var drug: String
    var mg: Double
    var time: Date
    var courseId: String?
    var unit: String
    var isImported: Bool

    init(id: String = UUID().uuidString, drug: String, mg: Double, time: Date,
         courseId: String? = nil, unit: String = "mg", isImported: Bool = false) {
        self.id = id; self.drug = drug; self.mg = mg; self.time = time
        self.courseId = courseId; self.unit = unit; self.isImported = isImported
    }
}

struct PKIntake: Identifiable {
    var id: String
    var time: Date
    var kind: String
    var mealType: String
    var drink: String
    var note: String
}

struct PKSample: Identifiable {
    var id: Date { time }
    let time: Date
    let concentration: Double
    let equivalent: Double
    let unfed: Double
}

private final class PKPeakBox: NSObject {
    let hours: Double
    let level: Double
    init(hours: Double, level: Double) {
        self.hours = hours
        self.level = level
    }
}

struct PKModel {
    // The website caches calibrated absorption parameters and equivalent peak
    // shapes. Without these caches, 300+ recorded doses × 200 graph points
    // would repeat millions of unnecessary binary-search iterations.
    private static let kaCache: NSCache<NSString, NSNumber> = {
        let value = NSCache<NSString, NSNumber>()
        value.countLimit = 128
        return value
    }()
    private static let peakCache: NSCache<NSString, PKPeakBox> = {
        let value = NSCache<NSString, PKPeakBox>()
        value.countLimit = 128
        return value
    }()

    // A catalog hot update can change food absorption shapes without changing
    // the old NSCache keys. Invalidate both derived caches before activation.
    static func invalidateCaches() {
        kaCache.removeAllObjects()
        peakCache.removeAllObjects()
    }

    let catalog: PKCatalog
    var doses: [PKDose]
    var intakes: [PKIntake]
    var renalCrCl: Double?
    var engineSource: String? = nil

    func drug(_ id: String) -> PKDrug? { catalog.drugs.first { $0.id == id } }

    func effectiveHalfLife(_ drug: PKDrug) -> Double {
        guard let baseline = drug.halfLife else { return 0 }
        if drug.id == "pregabalin", let crcl = renalCrCl, crcl >= 15, crcl <= 150 {
            // The same simplified renal adjustment used by the live website.
            return baseline * 100 / crcl
        }
        return baseline
    }

    static func kaFor(tmax: Double, ke: Double) -> Double {
        guard tmax.isFinite, tmax > 0, ke.isFinite, ke > 0 else { return .nan }
        let cacheKey = "\(tmax.bitPattern):\(ke.bitPattern)" as NSString
        if let cached = kaCache.object(forKey: cacheKey) { return cached.doubleValue }
        let equalPoint = 1 / ke
        if abs(tmax - equalPoint) <= 1e-10 * equalPoint { return ke }
        func peak(_ ka: Double) -> Double {
            let d = (ka - ke) / ke
            return abs(d) < 1e-8
                ? (d == 0 ? 1 / ke : log1p(d) / (ke * d))
                : log(ka / ke) / (ka - ke)
        }
        var lo: Double
        var hi: Double
        if tmax > equalPoint {
            lo = max(ke * 1e-12, 1e-15); hi = ke
        } else {
            lo = ke
            hi = max(ke * 2, 2 / tmax)
            while peak(hi) > tmax && hi < 1e12 { hi *= 2 }
        }
        for _ in 0..<100 {
            let mid = (lo + hi) / 2
            if peak(mid) > tmax { lo = mid } else { hi = mid }
        }
        let calibrated = (lo + hi) / 2
        kaCache.setObject(NSNumber(value: calibrated), forKey: cacheKey)
        return calibrated
    }

    static func oralKernel(ka: Double, ke: Double, hours: Double) -> Double {
        guard hours > 0 else { return 0 }
        let delta = ka - ke
        if abs(delta) < 1e-10 * max(1, max(ka, ke)) {
            return ka * hours * exp(-ke * hours)
        }
        if delta > 0 {
            return ka * exp(-ke * hours) * (-expm1(-delta * hours)) / delta
        }
        return ka * exp(-ka * hours) * (-expm1(delta * hours)) / (-delta)
    }

    private func matchedMeal(for dose: PKDose, drug: PKDrug) -> PKIntake? {
        let before = catalog.food[drug.id]?.mealWindowMinutes ?? 90
        // Source site: meal <= dose + 15 min and >= dose - 90 or custom window.
        return intakes.filter {
            $0.kind == "meal" &&
            $0.time.timeIntervalSince(dose.time) <= 15 * 60 &&
            $0.time.timeIntervalSince(dose.time) >= -before * 60
        }.min { a, b in
            abs(a.time.timeIntervalSince(dose.time)) <
            abs(b.time.timeIntervalSince(dose.time))
        }
    }

    private func single(drug: PKDrug, mg: Double, hours: Double,
                        dose: PKDose?, includeFood: Bool) -> Double {
        guard drug.canCalculate, hours >= 0,
              let baseHalfLife = drug.halfLife,
              let ref = drug.refDose, let cmax = drug.cmax,
              let tmax = drug.tmax else { return 0 }

        let baseKe = log(2) / baseHalfLife
        let ke = log(2) / effectiveHalfLife(drug)
        let ka = Self.kaFor(tmax: tmax, ke: baseKe)
        let referenceKernel = Self.oralKernel(ka: ka, ke: baseKe, hours: tmax)
        guard referenceKernel > 0 else { return 0 }
        let fOverV = (cmax / ref) / referenceKernel
        if includeFood, let dose,
           let meal = matchedMeal(for: dose, drug: drug),
           let fed = catalog.food[drug.id]?.fed {
            let highFat = meal.mealType == "highFat" ? fed.highFat : nil
            let selectedParts = highFat?.parts ?? fed.parts
            let selectedRatio = highFat?.aucRatio ?? fed.aucRatio ?? 1
            let parts = selectedParts.reduce(0.0) { total, part in
                total + part.weight *
                Self.oralKernel(ka: Self.kaFor(tmax: part.tmax, ke: baseKe),
                                ke: ke, hours: hours)
            }
            // Website high-fat AUC uses highFat's own aucRatio, otherwise parent.
            return mg * fOverV * selectedRatio * parts
        }
        return mg * fOverV * Self.oralKernel(ka: ka, ke: ke, hours: hours)
    }

    func concentration(_ drug: PKDrug, at time: Date, includeFood: Bool = true,
                       additional: [PKDose] = []) -> Double {
        if engineSource != nil {
            // An invalid signed runtime is not silently substituted with an
            // unrelated old formula that could mislead users.
            guard let point = PKHotMath.compute(model: self, drug: drug,
                times: [time], additional: additional)?.first else { return .nan }
            return includeFood ? point.concentration : point.unfed
        }
        return (doses + additional).filter { $0.drug == drug.id }.reduce(0.0) { total, dose in
            total + single(drug: drug, mg: dose.mg,
                           hours: time.timeIntervalSince(dose.time) / 3600,
                           dose: dose, includeFood: includeFood)
        }
    }

    private func equivalentPeak(drug: PKDrug, dose: PKDose) -> (hours: Double, level: Double) {
        let mealType = matchedMeal(for: dose, drug: drug)?.mealType ?? "none"
        let key = "\(drug.id):\(drug.halfLife ?? 0):\(drug.tmax ?? 0):\(effectiveHalfLife(drug)):\(mealType)" as NSString
        if let peak = Self.peakCache.object(forKey: key) {
            return (hours: peak.hours, level: peak.level)
        }
        let horizon = min(72, max(12, max((drug.tmax ?? 0) * 8, effectiveHalfLife(drug) * 3)))
        let count = Int(horizon * 60 / 2)
        var result = (hours: 0.0, level: 0.0)
        for step in 0...count {
            let h = Double(step) / 30
            let level = single(drug: drug, mg: 1, hours: h, dose: dose, includeFood: true)
            if level > result.level { result = (h, level) }
        }
        Self.peakCache.setObject(PKPeakBox(hours: result.hours, level: result.level), forKey: key)
        return result
    }

    func equivalent(_ drug: PKDrug, at time: Date, additional: [PKDose] = []) -> Double {
        if engineSource != nil {
            return PKHotMath.compute(model: self, drug: drug, times: [time],
                additional: additional)?.first?.equivalent ?? .nan
        }
        guard drug.canCalculate else { return 0 }
        return (doses + additional).filter { $0.drug == drug.id }.reduce(0.0) { total, dose in
            let hours = time.timeIntervalSince(dose.time) / 3600
            if hours < 0 { return total }
            let peak = equivalentPeak(drug: drug, dose: dose)
            if peak.level <= 0 { return total }
            if hours <= peak.hours {
                let level = single(drug: drug, mg: 1, hours: hours,
                                   dose: dose, includeFood: true)
                return total + dose.mg * max(0, level / peak.level)
            }
            return total + dose.mg * pow(2, -(hours - peak.hours) / effectiveHalfLife(drug))
        }
    }

    func curve(drug: PKDrug, from start: Date, hours: Double = 48,
               stepMinutes: Int = 15, additional: [PKDose] = []) -> [PKSample] {
        let count = max(2, Int(hours * 60) / max(1, stepMinutes))
        if engineSource != nil {
            let times = (0...count).map { start.addingTimeInterval(Double($0 * stepMinutes) * 60) }
            return PKHotMath.compute(model: self, drug: drug,
                times: times, additional: additional) ?? []
        }
        return (0...count).map { i in
            let moment = start.addingTimeInterval(Double(i * stepMinutes) * 60)
            return PKSample(time: moment,
                            concentration: concentration(drug, at: moment, additional: additional),
                            equivalent: equivalent(drug, at: moment, additional: additional),
                            unfed: concentration(drug, at: moment, includeFood: false, additional: additional))
        }
    }

    /// A mathematical sensitivity preview, NOT a recommended dose.
    /// The user specifies a hypothetical dose; the system evaluates
    /// resulting model values and never recommends actual administration.
    func hypothetical(drug: PKDrug, mg: Double, at when: Date, inspect: Date)
        -> (blood: Double, equivalent: Double) {
        let tentative = PKDose(drug: drug.id, mg: mg, time: when)
        return (concentration(drug, at: inspect, additional: [tentative]),
                equivalent(drug, at: inspect, additional: [tentative]))
    }
}
