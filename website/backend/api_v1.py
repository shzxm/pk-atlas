"""Authenticated Shortcuts API and the site's teaching PK model."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import math
import secrets
import time
from datetime import datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Shanghai")
_CATALOG = json.loads(Path(__file__).with_name("drugs.json").read_text())
DRUGS = {d["id"]: (d["name"], d["refDose"], d["cmax"], d["tmax"], d["halfLife"]) for d in _CATALOG["drugs"]}
RECORD_ONLY = {d["id"] for d in _CATALOG["drugs"] if d.get("recordOnly")}
FED = {key: ([(part["tmax"], part["weight"]) for part in info["fed"]["parts"]], info["fed"].get("aucRatio", 1)) for key, info in _CATALOG["food"].items() if "fed" in info}
_high_fat = _CATALOG["food"]["pregabalin"]["fed"]["highFat"]
HIGH_FAT_PREGABALIN = ([(part["tmax"], part["weight"]) for part in _high_fat["parts"]], _high_fat["aucRatio"])
MEAL_WINDOW_MINUTES = {key: info.get("mealWindowMinutes", 90) for key, info in _CATALOG["food"].items()}


def now_ms():
    return int(time.time() * 1000)


def date_key(ms):
    return datetime.fromtimestamp(ms / 1000, TZ).date().isoformat()


def parse_date(value):
    try:
        return datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=TZ)
    except (ValueError, TypeError):
        raise ValueError("日期应为 YYYY-MM-DD")


def parse_time(value):
    if value is None:
        return now_ms()
    if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value):
        return int(value)
    if isinstance(value, str):
        try:
            if len(value) == 5 and value[2] == ":":
                today = datetime.now(TZ).date().isoformat()
                value = today + "T" + value
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=TZ)
            return int(dt.timestamp() * 1000)
        except ValueError:
            pass
    raise ValueError("时间应为带时区的 ISO 8601 字符串或 Unix 毫秒")


def canonical_drug(value):
    if not isinstance(value, str):
        raise ValueError("不支持该药物")
    if value in DRUGS:
        return value
    return next((key for key, drug in DRUGS.items() if drug[0] == value), value)


def curve_summary(name, points, current):
    # A compact plot that remains legible in the Shortcuts result sheet.
    start = points[0]["time"]
    day_points = [p for p in points if p["time"] < start + 24 * 3600000]
    day = [min(day_points, key=lambda p: abs(p["time"] - start - hour * 3600000))
           for hour in range(24)]
    maximum = max((p["bloodMgL"] for p in day), default=0)
    blocks = "▁▂▃▄▅▆▇█"
    plot = "".join(blocks[min(7, int(p["bloodMgL"] / maximum * 7))]
                   for p in day) if maximum else "▁" * len(day)
    return (f"{name} · 估算血药浓度曲线\n00:00 {plot} 23:00\n"
            f"当前约 {current['bloodMgL']:.3f} mg/L；剂量等效量约 {current['equivalentMg']:.1f} mg。\n"
            "群体药代教学模型，非实测浓度或服药建议。")


def public_time(ms):
    return datetime.fromtimestamp(ms / 1000, TZ).isoformat(timespec="minutes")


def display_time(ms):
    return datetime.fromtimestamp(ms / 1000, TZ).strftime("%m/%d %H:%M")


def display_number(value, places=2):
    return f"{value:.{places}f}".rstrip("0").rstrip(".")


def curve_readout(model, day, now):
    """Match the two text readouts shown beside the site's current-drug chart."""
    start_of_day = int(parse_date(day).timestamp() * 1000)
    next_day = start_of_day + 86400000
    day_rows = [row for row in model.rows if date_key(row["time"]) == day]
    anchor = start_of_day
    last = max((row["time"] for row in day_rows), default=anchor)
    tail = max(8, model.effective_half_life * 4) * 3600000
    start = max(anchor - 1800000, last - (14 * 86400000 - tail))
    end = min(start + 14 * 86400000,
              max(start + 24 * 3600000, next_day + tail, last + tail))
    model_rows = [row for row in model.rows
                  if start - 30 * model.effective_half_life * 3600000 <= row["time"] <= end]
    # The webpage samples the visible curve densely; one-minute points make the
    # text peak independent of phone width and chart zoom.
    sample_times = range(int(start), int(end) + 1, 60000)
    peak = 0.
    unfed_peak = 0.
    food_difference = 0.
    for at in sample_times:
        fed = model.blood(at, model_rows)
        unfed = model.blood(at, model_rows, include_food=False)
        peak = max(peak, fed)
        unfed_peak = max(unfed_peak, unfed)
        food_difference = max(food_difference, abs(fed - unfed))
    food_effect = food_difference > max(.001, peak, unfed_peak) * .001
    level = model.blood(now)
    equivalent = model.equivalent(now)
    inside = start <= now <= end
    now_text = (f"现在 {display_time(now)} · 血药 {display_number(level, 3 if level < 1 else 2)} mg/L"
                f" · 剂量等效 {display_number(equivalent, 1)} mg（等效）"
                f"{'（当前时间不在图示窗口）' if not inside else ''}")
    if model.rows:
        meal_types = []
        if model.drug_id == "pregabalin":
            for row in model_rows:
                meal = model.meal(row["time"])
                if meal:
                    label = "高脂餐" if meal.get("mealType") == "highFat" else "普通餐"
                    if label not in meal_types:
                        meal_types.append(label)
        meal_text = f" · 餐型：{'、'.join(meal_types)}" if meal_types else ""
        peak_text = (f" · 已计饮食峰值约 {display_number(peak, 3)} mg/L；"
                     f"未计饮食参考峰值约 {display_number(unfed_peak, 3)} mg/L") if food_effect else ""
        caption = (f"仅统计{model.name} · 历史共 {len(model.rows)} 次记录，同药物跨日残留已计入"
                   f"{meal_text}{peak_text} · 当前窗口 {display_time(start)}—{display_time(end)}")
    else:
        caption = f"{model.name}暂无单次记录"
    return {"nowText": now_text, "caption": caption,
            "windowStart": start, "windowEnd": end}


def number(value, name, low, high):
    if isinstance(value, bool):
        raise ValueError(f"{name}无效")
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise ValueError(f"{name}无效")
    if not math.isfinite(value) or value < low or value > high:
        raise ValueError(f"{name}须在 {low}–{high} 之间")
    return value


def user_for_key(con, username, header):
    if not isinstance(username, str) or not username:
        return None
    if not header.startswith("Bearer "):
        return None
    token = header[7:]
    if len(token) != 43:
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    row = con.execute(
        "SELECT u.id, u.username FROM api_keys k JOIN users u ON u.id=k.user_id "
        "WHERE u.username=? AND k.token_hash=?",
        (username.strip().lower(), digest),
    ).fetchone()
    return row


def create_key(con, user_id):
    token = secrets.token_urlsafe(32)
    digest = hashlib.sha256(token.encode()).hexdigest()
    con.execute("DELETE FROM api_keys WHERE user_id=?", (user_id,))
    con.execute(
        "INSERT INTO api_keys(token_hash,user_id,created_at) VALUES(?,?,?)",
        (digest, user_id, int(time.time())),
    )
    return token


def ka_for(tmax, ke):
    """Invert oral Tmax on either side of ka == ke, including flip-flop cases."""
    if not (math.isfinite(tmax) and tmax > 0 and math.isfinite(ke) and ke > 0):
        raise ValueError("invalid pharmacokinetic parameters")
    equal_peak = 1 / ke
    if abs(tmax - equal_peak) <= 1e-10 * equal_peak:
        return ke

    def peak_at(ka):
        delta = (ka - ke) / ke
        if delta == 0:
            return 1 / ke
        return (math.log1p(delta) / (ke * delta) if abs(delta) < 1e-8
                else math.log(ka / ke) / (ka - ke))

    if tmax > equal_peak:
        lo, hi = max(ke * 1e-12, 1e-15), ke
    else:
        lo, hi = ke, max(ke * 2, 2 / tmax)
        while peak_at(hi) > tmax and hi < 1e12:
            hi *= 2
    for _ in range(100):
        mid = (lo + hi) / 2
        if peak_at(mid) > tmax:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def oral_kernel(ka, ke, hours):
    """Stable unit oral response including nearly coincident rates."""
    if hours <= 0:
        return 0.
    delta = ka - ke
    if abs(delta) < 1e-10 * max(1., ka, ke):
        return ka * hours * math.exp(-ke * hours)
    if delta > 0:
        return ka * math.exp(-ke * hours) * (-math.expm1(-delta * hours)) / delta
    return ka * math.exp(-ka * hours) * (-math.expm1(delta * hours)) / (-delta)


class Model:
    def __init__(self, drug_id, state):
        if drug_id not in DRUGS:
            raise ValueError("不支持该药物")
        if drug_id in RECORD_ONLY:
            raise ValueError("FTC/TAF 是双成分复方；本站暂不提供单一血药浓度曲线或反算")
        self.drug_id = drug_id
        self.name, self.ref_dose, self.cmax, self.tmax, self.half_life = DRUGS[drug_id]
        self.rows = sorted(
            (r for r in state.get("records", []) if isinstance(r, dict)
             and r.get("drug") == drug_id and isinstance(r.get("time"), (int, float))
             and isinstance(r.get("mg"), (int, float)) and r["mg"] > 0),
            key=lambda r: r["time"],
        )
        self.meals = [
            x for x in state.get("intakes", []) if isinstance(x, dict)
            and x.get("kind") == "meal" and isinstance(x.get("time"), (int, float))
        ]
        renal = state.get("settings", {}).get("renal")
        crcl = renal.get("crcl") if isinstance(renal, dict) else None
        self.effective_half_life = (
            self.half_life * 100 / float(crcl)
            if drug_id == "pregabalin" and isinstance(crcl, (float, int))
            and 15 <= crcl <= 150 else self.half_life
        )
        base_ke = math.log(2) / self.half_life
        self.ke = math.log(2) / self.effective_half_life
        self.ka = ka_for(self.tmax, base_ke)
        # Reference population Cmax is calibration, not a personal measured Vd.
        self.f_over_v = (self.cmax / self.ref_dose) / oral_kernel(self.ka, base_ke, self.tmax)
        self.base_ke = base_ke
        self._peak_cache = {}
        self.state = state
        self.fed_parts = {}
        for name, variant in (("regular", FED.get(self.drug_id)),
                              ("highFat", HIGH_FAT_PREGABALIN if self.drug_id == "pregabalin" else FED.get(self.drug_id))):
            if variant:
                parts, auc = variant
                computed = []
                for tmax, weight in parts:
                    ka = ka_for(tmax, base_ke)
                    computed.append((ka, auc * weight))
                self.fed_parts[name] = computed

    def meal(self, dose_time):
        before = MEAL_WINDOW_MINUTES.get(self.drug_id, 90)
        matches = [x for x in self.meals if dose_time - before * 60000 <= x["time"] <= dose_time + 15 * 60000]
        return min(matches, key=lambda x: abs(x["time"] - dose_time)) if matches else None

    def single(self, mg, hours, dose_time, include_food=True):
        if hours < 0:
            return 0.
        variant = FED.get(self.drug_id)
        meal = self.meal(dose_time) if variant and include_food else None
        if meal:
            parts = self.fed_parts["highFat" if meal.get("mealType") == "highFat" else "regular"]
            return mg * self.f_over_v * sum(
                weight * oral_kernel(ka, self.ke, hours)
                for ka, weight in parts
            )
        return mg * self.f_over_v * oral_kernel(self.ka, self.ke, hours)

    def blood(self, at, rows=None, include_food=True):
        return sum(self.single(r["mg"], (at - r["time"]) / 3600000, r["time"], include_food)
                   for r in (self.rows if rows is None else rows) if r["time"] <= at)

    def _peak_info(self, dose_time):
        meal = self.meal(dose_time)
        variant = meal.get("mealType", "regular") if meal else "none"
        key = (variant, self.effective_half_life)
        if key not in self._peak_cache:
            horizon = min(72, max(12, self.tmax * 8, self.effective_half_life * 3))
            self._peak_cache[key] = max(
                ((m / 60, self.single(1, m / 60, dose_time))
                 for m in range(0, int(horizon * 60) + 1, 2)),
                key=lambda pair: pair[1],
            )
        return self._peak_cache[key]

    def peak_ms(self, dose_time):
        return self._peak_info(dose_time)[0] * 3600000

    def equivalent(self, at, rows=None):
        total = 0.
        for r in self.rows if rows is None else rows:
            hours = (at - r["time"]) / 3600000
            if hours < 0:
                continue
            peak_hours, peak_level = self._peak_info(r["time"])
            if peak_level <= 0:
                continue
            if hours <= peak_hours:
                total += r["mg"] * max(0, self.single(1, hours, r["time"]) / peak_level)
            else:
                total += r["mg"] * 2 ** (-(hours - peak_hours) / self.effective_half_life)
        return total

    def value(self, at, mode="blood", rows=None):
        return self.equivalent(at, rows) if mode == "equivalent" else self.blood(at, rows)

    def strengths(self):
        plan = self.state.get("plans", {}).get(self.drug_id, {})
        if not isinstance(plan, dict):
            return []
        raw = plan.get("strengths")
        if not isinstance(raw, list):
            raw = [{"mg": plan["strength"], "unit": "粒"}] if isinstance(plan.get("strength"), (int, float)) else []
        return [s for s in raw[:8] if isinstance(s, dict)
                and isinstance(s.get("mg"), (int, float)) and .001 <= s["mg"] <= 1e6]

    def options(self):
        strengths = self.strengths()
        if not strengths:
            return []
        max_units = 20 if len(strengths) <= 3 else 12 if len(strengths) <= 5 else 8
        amounts = [round(s["mg"] * 1000) for s in strengths]
        best = {}
        def visit(i, left, total, counts):
            if i == len(amounts):
                if total and (total not in best or sum(counts) < sum(best[total])):
                    best[total] = counts
                return
            for n in range(left + 1):
                visit(i + 1, left - n, total + n * amounts[i], counts + [n])
        visit(0, max_units, 0, [])
        return [(mg / 1000, [{"count": n, "mg": strengths[i]["mg"], "unit": strengths[i].get("unit", "粒")}
                              for i, n in enumerate(counts) if n])
                for mg, counts in sorted(best.items())]

    def inverse(self, threshold, start, hours, now, mode="blood", count=None):
        end = start + int(hours * 3600000)
        sample_times = list(range(start, end, 300000)) + [end]
        samples = [(t, self.value(t, mode, [r for r in self.rows if r["time"] <= now])) for t in sample_times]
        if all(base >= threshold - 1e-8 for _, base in samples):
            return {"alreadyAbove": True, "doses": [], "totalMg": 0}
        options = self.options()
        if not options:
            return {"reason": "specs"}
        plan = self.state.get("plans", {}).get(self.drug_id, {})
        if not isinstance(plan, dict):
            plan = {}
        max_dose = float(plan["dose"]) if isinstance(plan.get("dose"), (int, float)) and plan["dose"] > 0 else math.inf
        gap = float(plan["interval"]) * 3600000 if isinstance(plan.get("interval"), (int, float)) and plan["interval"] > 0 else 0
        usable = [option for option in options if option[0] <= max_dose + 1e-8]
        if not usable:
            return {"reason": "cap"}
        first = max(now, start - 12 * 3600000)
        first_times = list(range(first, start, 1200000))
        if not first_times or first_times[-1] != start:
            first_times.append(start)
        counts = [count] if count else range(1, 9)
        best = None
        for n in counts:
            for t0 in first_times:
                for shift in ([0] if n == 1 else [0, .25, .5]):
                    span = max(0, end - t0)
                    times = [t0 if i == 0 else round((t0 + span * (i - shift) / (n - shift)) / 60000) * 60000 for i in range(n)]
                    if any(times[i] - times[i - 1] < gap - 1000 for i in range(1, n)):
                        continue
                    doses = []
                    possible = True
                    for i, dose_time in enumerate(times):
                        boundary = end if i == n - 1 else min(end, times[i + 1] + self.peak_ms(times[i + 1]))
                        required = 0.
                        for t, base in samples:
                            if t > (dose_time + self.peak_ms(dose_time) if i else start) + 1 or t > boundary + 1:
                                continue
                            prior = sum(self._dose_value(d["mg"], d["time"], t, mode) for d in doses)
                            remaining = threshold - base - prior
                            if remaining <= 1e-8:
                                continue
                            per_mg = self._dose_value(1, dose_time, t, mode)
                            if per_mg <= 1e-10:
                                possible = False
                                break
                            required = max(required, remaining / per_mg)
                        if not possible:
                            break
                        option = next((o for o in usable if o[0] + 1e-9 >= max(required, usable[0][0])), None)
                        if not option:
                            possible = False
                            break
                        doses.append({"time": dose_time, "mg": option[0], "parts": option[1]})
                    if not possible:
                        continue
                    levels = [base + sum(self._dose_value(d["mg"], d["time"], t, mode) for d in doses)
                              for t, base in samples]
                    minimum = min(levels)
                    if minimum < threshold - 1e-6:
                        continue
                    total = sum(d["mg"] for d in doses)
                    peak = max(levels)
                    if best is None or total < best["totalMg"] - 1e-6 or (abs(total - best["totalMg"]) < 1e-6 and peak < best["peak"]):
                        best = {"doses": doses, "totalMg": total, "peak": peak,
                                "minimum": minimum, "count": n}
        if best is None:
            return {"reason": "noSolution"}
        for dose in best["doses"]:
            dose["timeIso"] = public_time(dose["time"])
        return best

    def _dose_value(self, mg, dose_time, at, mode):
        row = {"mg": mg, "time": dose_time}
        return self.value(at, mode, [row])

    def point_inverse(self, threshold, target, now, mode="blood", cap=math.inf, count=None):
        """Finite whole-unit point scenario, sampled every five minutes."""
        samples = list(range(now, target, 300000)) + [target]
        base = [self.value(t, mode, [r for r in self.rows if r["time"] <= now]) for t in samples]
        if all(x >= threshold - 1e-6 for x in base):
            return {"alreadyAbove": True, "doses": [], "totalMg": 0, "count": 0,
                    "targetValue": base[-1], "continuousFrom": now}
        options = [x for x in self.options() if x[0] <= cap + 1e-9]
        if not self.strengths():
            return {"reason": "specs"}
        if not options:
            return {"reason": "cap"}
        plan = self.state.get("plans", {}).get(self.drug_id, {})
        gap = float(plan.get("interval") or 0) * 3600000 if isinstance(plan, dict) else 0
        response = lambda mg, dose_time, at: self._dose_value(mg, dose_time, at, mode)
        def nearest(required):
            return next((x for x in options if x[0] >= required - 1e-9), None)
        def evaluate(doses):
            levels = [b + sum(response(d["mg"], d["time"], t) for d in doses)
                      for t, b in zip(samples, base)]
            last_below = next((i for i in range(len(levels)-1, -1, -1)
                               if levels[i] < threshold - 1e-6), None)
            continuous = now if last_below is None else (samples[last_below + 1]
                         if last_below + 1 < len(samples) else None)
            return {"doses": doses, "totalMg": sum(d["mg"] for d in doses),
                    "count": len(doses), "targetValue": levels[-1],
                    "continuousFrom": continuous, "allCovered": last_below is None,
                    "minimum": min(levels), "peak": max(levels)}
        if count is None:
            doses = []
            if base[0] < threshold:
                check = min(target, now + self.peak_ms(now))
                per_mg = response(1, now, check)
                needed = (threshold - self.value(check, mode)) / per_mg if per_mg > 0 else 0
                option = nearest(max(options[0][0], needed * 1.002)) or options[-1]
                doses.append({"time": now, "mg": option[0], "parts": option[1]})
            for at in range(now, target, 1800000):
                if len(doses) >= 12:
                    break
                if at == now and base[0] < threshold:
                    continue
                if doses and at - doses[-1]["time"] < gap - 1000:
                    continue
                needed = 0.
                lead = self.peak_ms(at)
                for check in (at + lead, min(target, at + lead + 1800000)):
                    if check > target:
                        continue
                    deficit = threshold - self.value(check, mode) - sum(
                        response(d["mg"], d["time"], check) for d in doses)
                    per_mg = response(1, at, check)
                    if deficit > 0 and per_mg > 0:
                        needed = max(needed, deficit / per_mg)
                if needed > 0:
                    option = nearest(needed * 1.002) or options[-1]
                    doses.append({"time": at, "mg": option[0], "parts": option[1]})
            result = evaluate(doses)
        else:
            best = None
            last_allowed = target - 300000
            first_times = [now] if base[0] < threshold else list(range(now, max(now, int(last_allowed))+1, 1800000))
            for first in first_times:
                for fraction in ((0,) if count == 1 else (0, .25, .5, .75)):
                    last = first + (max(now, last_allowed) - first) * (1-fraction)
                    times = [first if i == 0 else round((first+(last-first)*i/(count-1))/60000)*60000
                             for i in range(count)]
                    if any(times[i]-times[i-1] < max(1800000, gap)-1000 for i in range(1,count)):
                        continue
                    doses = []
                    possible = True
                    for i, at in enumerate(times):
                        segment_end = target if i == count-1 else min(target, times[i+1]+self.peak_ms(times[i+1]))
                        required = options[0][0]
                        for t, b in zip(samples, base):
                            if t < at + self.peak_ms(at) - 1 or t > segment_end + 1:
                                continue
                            deficit = threshold-b-sum(response(d["mg"],d["time"],t) for d in doses)
                            if deficit <= 0:
                                continue
                            per_mg = response(1,at,t)
                            if per_mg <= 1e-10:
                                possible = False; break
                            required = max(required,deficit/per_mg*1.002)
                        if not possible:
                            break
                        option = nearest(required)
                        if not option:
                            possible = False; break
                        doses.append({"time":at,"mg":option[0],"parts":option[1]})
                    if not possible:
                        continue
                    candidate = evaluate(doses)
                    if candidate["continuousFrom"] is None:
                        continue
                    if best is None or (candidate["continuousFrom"] < best["continuousFrom"] or
                        candidate["continuousFrom"] == best["continuousFrom"] and
                        (candidate["totalMg"],candidate["peak"]) < (best["totalMg"],best["peak"])):
                        best = candidate
            if best is None:
                return {"reason":"fixedNoSolution"}
            result = best
        for dose in result["doses"]:
            dose["timeIso"] = public_time(dose["time"])
        return result
