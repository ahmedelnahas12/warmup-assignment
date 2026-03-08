const fs = require("fs");

function getShiftDuration(startTime, endTime) {
    const toSec = (str) => {
        const t = str.trim().toLowerCase();
        const m = t.match(/^\s*(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)\s*$/);
        if (!m) return 0;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const s = parseInt(m[3], 10);
        if (m[4] === "pm" && h !== 12) h += 12;
        if (m[4] === "am" && h === 12) h = 0;
        return h * 3600 + min * 60 + s;
    };
    const fmt = (sec) => {
        const h = Math.floor(sec / 3600);
        const r = sec % 3600;
        const m = Math.floor(r / 60);
        const s = Math.floor(r % 60);
        return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    };
    let start = toSec(startTime);
    let end = toSec(endTime);
    if (end <= start) end += 24 * 3600;
    return fmt(end - start);
}

function getIdleTime(startTime, endTime) {
    const toSec = (str) => {
        const t = str.trim().toLowerCase();
        const m = t.match(/^\s*(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)\s*$/);
        if (!m) return 0;
        let h = parseInt(m[1], 10);
        const min = parseInt(m[2], 10);
        const s = parseInt(m[3], 10);
        if (m[4] === "pm" && h !== 12) h += 12;
        if (m[4] === "am" && h === 12) h = 0;
        return h * 3600 + min * 60 + s;
    };
    const fmt = (sec) => {
        const h = Math.floor(sec / 3600);
        const r = sec % 3600;
        const m = Math.floor(r / 60);
        const s = Math.floor(r % 60);
        return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    };
    let start = toSec(startTime);
    let end = toSec(endTime);
    if (end <= start) end += 24 * 3600;
    const workStart = 8 * 3600, workEnd = 22 * 3600;
    let idle = 0;
    if (start < workStart) idle += Math.min(workStart, end) - start;
    if (end > workEnd) idle += end - Math.max(workEnd, start);
    return fmt(idle);
}

function getActiveTime(shiftDuration, idleTime) {
    const parseHMS = (str) => {
        const p = str.trim().split(":").map((x) => parseInt(x, 10) || 0);
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    };
    const fmt = (sec) => {
        const h = Math.floor(sec / 3600);
        const r = sec % 3600;
        const m = Math.floor(r / 60);
        const s = Math.floor(r % 60);
        return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    };
    const shiftSec = parseHMS(shiftDuration);
    const idleSec = parseHMS(idleTime);
    return fmt(Math.max(0, shiftSec - idleSec));
}

function metQuota(date, activeTime) {
    const parts = date.trim().split("-");
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const activeSec = (() => {
        const p = activeTime.trim().split(":").map((x) => parseInt(x, 10) || 0);
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    })();
    const eidStart = new Date(2025, 3, 10).getTime();
    const eidEnd = new Date(2025, 3, 30).getTime();
    const quota = (d.getTime() >= eidStart && d.getTime() <= eidEnd) ? 6 * 3600 : 8 * 3600 + 24 * 60;
    return activeSec >= quota;
}

function addShiftRecord(textFile, shiftObj) {
    const id = shiftObj.driverID.trim();
    const name = shiftObj.driverName.trim();
    const date = shiftObj.date.trim();
    const start = shiftObj.startTime.trim();
    const end = shiftObj.endTime.trim();

    const data = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = data.split(/\r?\n/).filter((l) => l.length > 0);
    const dataLines = lines.slice(1);

    for (let i = 0; i < dataLines.length; i++) {
        const cols = dataLines[i].split(",");
        if (cols[0].trim() === id && cols[2].trim() === date) return {};
    }

    const shiftDuration = getShiftDuration(start, end);
    const idleTime = getIdleTime(start, end);
    const activeTime = getActiveTime(shiftDuration, idleTime);
    const met = metQuota(date, activeTime);
    const newRow = [id, name, date, start, end, shiftDuration, idleTime, activeTime, String(met), "false"].join(",");

    let lastIdx = -1;
    for (let i = dataLines.length - 1; i >= 0; i--) {
        if (dataLines[i].split(",")[0].trim() === id) {
            lastIdx = i;
            break;
        }
    }

    let out;
    if (lastIdx === -1) out = lines.concat([newRow]);
    else out = [lines[0]].concat(dataLines.slice(0, lastIdx + 1), [newRow], dataLines.slice(lastIdx + 1));
    fs.writeFileSync(textFile, out.join("\n"), { encoding: "utf8" });

    return {
        driverID: id,
        driverName: name,
        date,
        startTime: start,
        endTime: end,
        shiftDuration,
        idleTime,
        activeTime,
        metQuota: met,
        hasBonus: false
    };
}

function setBonus(textFile, driverID, date, newValue) {
    const id = driverID.trim();
    const d = date.trim();
    const val = newValue === true ? "true" : "false";
    const data = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = data.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length >= 10 && cols[0].trim() === id && cols[2].trim() === d) {
            cols[9] = val;
            lines[i] = cols.join(",");
            break;
        }
    }
    fs.writeFileSync(textFile, lines.join("\n"), { encoding: "utf8" });
}

function countBonusPerMonth(textFile, driverID, month) {
    const id = driverID.trim();
    const m = String(month).trim().replace(/^0+/, "") || "0";
    const mPad = m.length === 1 ? "0" + m : m;
    const data = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = data.split(/\r?\n/);
    let found = false, count = 0;
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 10) continue;
        if (cols[0].trim() !== id) continue;
        found = true;
        const datePart = cols[2].trim();
        const rowMonth = datePart.length >= 7 ? datePart.substring(5, 7) : "";
        const rowMonthNorm = rowMonth.replace(/^0+/, "") || "0";
        const match = (rowMonth === mPad || rowMonthNorm === m);
        if (match && cols[9].trim().toLowerCase() === "true") count++;
    }
    return found ? count : -1;
}

function getTotalActiveHoursPerMonth(textFile, driverID, month) {
    const id = driverID.trim();
    const monthStr = month <= 9 ? "0" + month : "" + month;
    const data = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = data.split(/\r?\n/);
    let total = 0;
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 8) continue;
        if (cols[0].trim() !== id) continue;
        const datePart = cols[2].trim();
        if (datePart.length < 7 || datePart.substring(5, 7) !== monthStr) continue;
        const p = cols[7].trim().split(":").map((x) => parseInt(x, 10) || 0);
        total += (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    }
    const h = Math.floor(total / 3600);
    const r = total % 3600;
    const m = Math.floor(r / 60);
    const s = Math.floor(r % 60);
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function getRequiredHoursPerMonth(textFile, rateFile, bonusCount, driverID, month) {
    const id = driverID.trim();
    const monthStr = month <= 9 ? "0" + month : "" + month;
    const rateData = fs.readFileSync(rateFile, { encoding: "utf8" });
    const rateLines = rateData.split(/\r?\n/);
    let dayOff = null;
    for (let i = 0; i < rateLines.length; i++) {
        const cols = rateLines[i].split(",");
        if (cols[0].trim() === id) {
            dayOff = cols[1].trim();
            break;
        }
    }
    const eidStart = new Date(2025, 3, 10).getTime();
    const eidEnd = new Date(2025, 3, 30).getTime();
    const quotaNorm = 8 * 3600 + 24 * 60;
    const quotaEid = 6 * 3600;

    const data = fs.readFileSync(textFile, { encoding: "utf8" });
    const lines = data.split(/\r?\n/);
    let total = 0;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols.length < 6 || cols[0].trim() !== id) continue;
        const datePart = cols[2].trim();
        if (datePart.length < 7 || datePart.substring(5, 7) !== monthStr) continue;
        const parts = datePart.split("-");
        const dayDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (dayNames[dayDate.getDay()] === dayOff) continue;
        const t = dayDate.getTime();
        total += (t >= eidStart && t <= eidEnd) ? quotaEid : quotaNorm;
    }
    total -= bonusCount * 2 * 3600;
    const h = Math.floor(total / 3600);
    const r = total % 3600;
    const m = Math.floor(r / 60);
    const s = Math.floor(r % 60);
    return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function getNetPay(driverID, actualHours, requiredHours, rateFile) {
    const id = driverID.trim();
    const parseHMS = (str) => {
        const p = str.trim().split(":").map((x) => parseInt(x, 10) || 0);
        return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    };
    const actualSec = parseHMS(actualHours);
    const requiredSec = parseHMS(requiredHours);
    const data = fs.readFileSync(rateFile, { encoding: "utf8" });
    const lines = data.split(/\r?\n/);
    let basePay = 0, tier = 4;
    for (let i = 0; i < lines.length; i++) {
        const cols = lines[i].split(",");
        if (cols[0].trim() === id) {
            basePay = parseInt(cols[2], 10) || 0;
            tier = parseInt(cols[3], 10) || 4;
            break;
        }
    }
    const allow = { 1: 50, 2: 20, 3: 10, 4: 3 }[tier] || 3;
    let missing = requiredSec - actualSec;
    if (missing <= 0) return basePay;
    missing -= allow * 3600;
    if (missing <= 0) return basePay;
    const billableHrs = Math.floor(missing / 3600);
    const rate = Math.floor(basePay / 185);
    return basePay - billableHrs * rate;
}

module.exports = {
    getShiftDuration,
    getIdleTime,
    getActiveTime,
    metQuota,
    addShiftRecord,
    setBonus,
    countBonusPerMonth,
    getTotalActiveHoursPerMonth,
    getRequiredHoursPerMonth,
    getNetPay
};
