import React, { useEffect, useState } from "react";
import tracker from "../utils/tracker";

function fmtSeconds(sec) {
  sec = Number(sec || 0);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export default function AdminDashboard() {
  const [activity, setActivity] = useState(tracker.getActivity());
  useEffect(() => {
    setActivity(tracker.getActivity());
  }, []);

  const activities = activity.activities || {};
  const list = Object.keys(activities).map((t) => ({ title: t, ...activities[t] }));
  list.sort((a, b) => (b.totalSeconds || 0) - (a.totalSeconds || 0));
  
  // Get a nicely formatted time string (e.g., "2:30 PM" or "Yesterday at 3:45 PM")
  function formatViewTime(ts) {
    const date = new Date(ts);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = new Date(now - 86400000).toDateString() === date.toDateString();
    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    
    if (isToday) return `Today at ${timeStr}`;
    if (isYesterday) return `Yesterday at ${timeStr}`;
    return date.toLocaleString([], { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }

  return (
    <div>
      {/* Simple horizontal bar chart */}
      <div style={{marginBottom:16}}>
        <strong>Time spent chart</strong>
        <div style={{marginTop:8, display:'flex', flexDirection:'column', gap:8}}>
          {list.length === 0 ? (
            <div style={{fontStyle:'italic'}}>No activity to chart</div>
          ) : (
            (() => {
              const max = Math.max(...list.map((r) => r.totalSeconds || 0), 1);
              return list.map((r) => {
                const pct = Math.round(((r.totalSeconds || 0) / max) * 100);
                return (
                  <div key={r.title} style={{display:'flex', alignItems:'center', gap:12}}>
                    <div style={{width:120, textAlign:'left', fontSize:13}}>{r.title}</div>
                    <div style={{flex:1, background:'#eee', height:18, borderRadius:9, overflow:'hidden'}}>
                      <div style={{width:`${pct}%`, height:'100%', background:'linear-gradient(90deg,#6366f1,#06b6d4)'}} />
                    </div>
                    <div style={{width:80, textAlign:'right', fontSize:13}}>{fmtSeconds(r.totalSeconds)}</div>
                  </div>
                );
              });
            })()
          )}
        </div>
      </div>
      <div style={{marginBottom:12}}>
        <strong>Last viewed painting:</strong>
        <div style={{marginTop:6}}>{activity.lastViewed ? activity.lastViewed.title : <em>None recorded</em>}</div>
        <div style={{fontSize:12, color:'#666'}}>{activity.lastViewed ? new Date(activity.lastViewed.ts).toLocaleString() : ''}</div>
      </div>

      <div style={{marginBottom:12}}>
        <strong>Total time spent (all sessions):</strong>
        <div style={{marginTop:6}}>{fmtSeconds(activity.totalSeconds)}</div>
      </div>

      {/* View history (when paintings were seen) */}
      <div style={{marginBottom:20}}>
        <strong>View history</strong>
        <div style={{marginTop:8}}>
          {list.length === 0 ? (
            <div style={{fontStyle:'italic'}}>No views recorded</div>
          ) : (
            <div style={{display:'flex', flexDirection:'column', gap:8}}>
              {list.map((row) => (
                <div key={row.title} style={{
                  display:'flex',
                  padding:'8px 12px',
                  background:'#f5f5f5',
                  borderRadius:8,
                  fontSize:14
                }}>
                  <div style={{flex:1}}>{row.title}</div>
                  <div style={{color:'#666'}}>{formatViewTime(row.lastTs)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{marginBottom:12}}>
        <strong>Per-painting stats:</strong>
        <div style={{marginTop:8}}>
          {list.length === 0 ? (
            <div style={{fontStyle:'italic'}}>No activity yet</div>
          ) : (
            <table style={{width:'100%', borderCollapse:'collapse'}}>
              <thead>
                <tr style={{textAlign:'left', borderBottom:'1px solid #eee'}}>
                  <th style={{padding:'6px 4px'}}>Painting</th>
                  <th style={{padding:'6px 4px'}}>Time</th>
                  <th style={{padding:'6px 4px'}}>Views</th>
                  <th style={{padding:'6px 4px'}}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.title} style={{borderBottom:'1px solid #f5f5f5'}}>
                    <td style={{padding:'8px 4px'}}>{row.title}</td>
                    <td style={{padding:'8px 4px'}}>{fmtSeconds(row.totalSeconds)}</td>
                    <td style={{padding:'8px 4px'}}>{row.views || 0}</td>
                    <td style={{padding:'8px 4px'}}>{row.lastTs ? new Date(row.lastTs).toLocaleString() : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{display:'flex', gap:8, justifyContent:'flex-end'}}>
        <button onClick={() => setActivity(tracker.getActivity())}>Refresh</button>
        <button onClick={() => { tracker.reset(); setActivity(tracker.getActivity()); }}>Reset</button>
      </div>
    </div>
  );
}
