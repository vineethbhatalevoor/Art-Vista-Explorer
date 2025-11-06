// Simple localStorage tracker for admin analytics
// Stores an object under key `artmuseum_activity`:
// {
//   lastViewed: { title, ts },
//   totalSeconds: number,
//   activities: { [title]: { totalSeconds, lastTs, views } }
// }

const STORAGE_KEY = "artmuseum_activity";

let active = null; // { title, startTs }

function read() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lastViewed: null, totalSeconds: 0, activities: {} };
    const parsed = JSON.parse(raw);
    // ensure shape
    return {
      lastViewed: parsed.lastViewed || null,
      totalSeconds: parsed.totalSeconds || 0,
      activities: parsed.activities || {},
    };
  } catch (e) {
    console.warn("tracker read failed", e);
    return { lastViewed: null, totalSeconds: 0, activities: {} };
  }
}

function write(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.warn("tracker write failed", e);
  }
}

export default {
  startViewing(title) {
    // if something already active, stop it first
    if (active && active.title === title) return;
    if (active) this.stopViewing();
    active = { title, startTs: Date.now() };
    const s = read();
    s.lastViewed = { title, ts: Date.now() };
    // ensure activity entry
    s.activities = s.activities || {};
    if (!s.activities[title]) s.activities[title] = { totalSeconds: 0, lastTs: Date.now(), views: 0 };
    write(s);
  },
  stopViewing() {
    if (!active) return;
    try {
      const now = Date.now();
      const seconds = Math.max(0, Math.round((now - active.startTs) / 1000));
      const s = read();
      s.totalSeconds = (s.totalSeconds || 0) + seconds;
      s.activities = s.activities || {};
      const entry = s.activities[active.title] || { totalSeconds: 0, lastTs: now, views: 0 };
      entry.totalSeconds = (entry.totalSeconds || 0) + seconds;
      entry.lastTs = now;
      entry.views = (entry.views || 0) + 1;
      s.activities[active.title] = entry;
      s.lastViewed = { title: active.title, ts: now };
      write(s);
    } finally {
      active = null;
    }
  },
  getActivity() {
    return read();
  },
  reset() {
    localStorage.removeItem(STORAGE_KEY);
    active = null;
  },
};
