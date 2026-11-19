"""Pure, stateless, read-only curve evaluation on the canonical 181 Python engine.

No user session, SQLite, arbitrary code, or external network access. The
request describes mathematical *hypothetical* inputs; it is never persisted.
"""
from __future__ import annotations

import hashlib
import math
from pathlib import Path

import api_v1
import model_distribution

MAX_SAMPLES = 650
MAX_RECORDS = 300
MAX_MEALS = 160
MAX_PLANNED = 30
DAY_MS = 86_400_000


def _number(value, low, high, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(name + "必须是有效数字")
    result = float(value)
    if not math.isfinite(result) or result < low or result > high:
        raise ValueError(name + "超出计算输入范围")
    return result


def _times(data):
    times = data.get("times")
    if not isinstance(times, list) or not 1 <= len(times) <= MAX_SAMPLES:
        raise ValueError("采样点数量须为 1–650")
    values = [int(_number(t, 1_000_000_000_000, 10_000_000_000_000, "采样时间"))
              for t in times]
    if any(b <= a for a, b in zip(values, values[1:])):
        raise ValueError("采样时间须严格递增")
    if values[-1] - values[0] > 72 * 3_600_000:
        raise ValueError("采样跨度不得超过 72 小时")
    return values


def _rows(data, key, limit, start, end, drug):
    incoming = data.get(key, [])
    if not isinstance(incoming, list) or len(incoming) > limit:
        raise ValueError(key + "输入条数超限")
    result = []
    for row in incoming:
        if not isinstance(row, dict):
            raise ValueError(key + "记录格式无效")
        t = int(_number(row.get("time"), start-180*DAY_MS, end, "记录时间"))
        mg = _number(row.get("mg"), .000001, 1_000_000, "记录剂量")
        if row.get("drug", drug) != drug:
            raise ValueError("记录药物与计算药物不一致")
        result.append({"drug": drug, "time": t, "mg": mg})
    return result


def run(data: dict) -> dict:
    if not isinstance(data, dict):
        raise ValueError("数学模型输入必须为 JSON 对象")
    drug = data.get("drugId")
    if not isinstance(drug, str) or drug not in api_v1.DRUGS:
        raise ValueError("未收录药物")
    if drug in api_v1.RECORD_ONLY:
        raise ValueError("该复方没有单一血药模型")
    times = _times(data)
    rows = _rows(data, "records", MAX_RECORDS, times[0], times[-1], drug)
    planned = _rows(data, "planned", MAX_PLANNED, times[0], times[-1], drug)
    if len(times) * (len(rows) + len(planned)) > 60000:
        raise ValueError("本次模型计算超过单请求资源边界，请缩短时间窗口")
    meals_in = data.get("meals", [])
    if not isinstance(meals_in, list) or len(meals_in) > MAX_MEALS:
        raise ValueError("饮食记录超出计算容量")
    meals = []
    for meal in meals_in:
        if not isinstance(meal, dict) or meal.get("kind") != "meal":
            raise ValueError("饮食记录格式无效")
        t = int(_number(meal.get("time"), times[0]-3*DAY_MS,
                        times[-1]+DAY_MS, "饮食时间"))
        kind = meal.get("mealType", "regular")
        if kind not in ("regular", "highFat"):
            raise ValueError("不支持的饮食类型")
        meals.append({"kind":"meal", "time": t, "mealType": kind})
    crcl = data.get("renalCrCl")
    renal = None
    if crcl is not None:
        renal = {"crcl":_number(crcl, 15, 150, "模型肾清除参数")}
    state = {"records":rows,"intakes":meals,"settings":{"renal":renal}}
    model = api_v1.Model(drug, state)
    merged = rows + planned
    points = []
    for when in times:
        blood = model.blood(when, rows)
        equivalent = model.equivalent(when, rows)
        unfed = model.blood(when, rows, include_food=False)
        item = {"time":when,"bloodMgL":blood,"equivalentMg":equivalent,
                "unfedMgL":unfed}
        if planned:
            item["plannedBloodMgL"]=model.blood(when, merged)
            item["plannedEquivalentMg"]=model.equivalent(when, merged)
        if not all(math.isfinite(x) and x >= 0 for x in item.values()):
            raise ValueError("模型计算出现非有限数值")
        points.append(item)
    package = model_distribution.package()
    return {"source":"181-server-math", "model":"数学模拟，非临床实测",
            "drugId":drug,"catalogVersion":package["catalogVersion"],
            "engineVersion":package["engineVersion"],
            "serverKernelSha256":hashlib.sha256(
                Path(api_v1.__file__).read_bytes()).hexdigest(),
            "points":points}
