// frontend/src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { loadModel, predict } from "./utils/model";
import { motion, AnimatePresence } from "framer-motion";
import "./App.css";
import tracker from "./utils/tracker";
import AdminDashboard from "./components/AdminDashboard";

const LABELS = ["Mona Lisa", "Starry Night", "The Scream"]; // replace with your labels in same order as model

export default function App() {
  const bgVideoRef = useRef(null);
  const videoRef = useRef(null); // preview (medium) video used for capture
  const canvasRef = useRef(null);
  const [ready, setReady] = useState({ model: false, camera: false });
  const [prediction, setPrediction] = useState(null);
  const [description, setDescription] = useState("");
  const [captureError, setCaptureError] = useState(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const audioRef = useRef(new Audio());
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [serviceUsed, setServiceUsed] = useState(null); // 'vision' | 'local' | null
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(() => sessionStorage.getItem("artmuseum_isAdmin") === "1");
  const [adminTotalSeconds, setAdminTotalSeconds] = useState(0);

  const fmtSeconds = (sec) => {
    sec = Number(sec || 0);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
  };

  // start camera automatically when component mounts (wait for videoRef)
  useEffect(() => {
    let mounted = true;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!mounted) return;
        // assign stream to both background and preview video elements if present
        if (bgVideoRef.current) {
          bgVideoRef.current.srcObject = stream;
          try { await bgVideoRef.current.play(); } catch {}
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try { await videoRef.current.play(); } catch {}
          setReady((r) => ({ ...r, camera: true }));
          console.log("🎥 Camera started");
        }
      } catch (err) {
        console.error("Camera access error:", err);
        alert("Please allow camera access (camera permission required).");
      }
    };

    // small microtask delay to ensure video element is mounted
    const t = setTimeout(startCamera, 200);
    return () => {
      mounted = false;
      clearTimeout(t);
        // stop tracks on unmount
        const anyRef = videoRef.current || bgVideoRef.current;
        if (anyRef && anyRef.srcObject) {
          const s = anyRef.srcObject;
          s.getTracks?.().forEach((t) => t.stop());
        }
    };
  }, []);

  // load model
  useEffect(() => {
    (async () => {
      try {
        await loadModel();
        setReady((r) => ({ ...r, model: true }));
      } catch (err) {
        console.error("Model failed to load:", err);
        alert("Model failed to load. Check console.");
      }
    })();
  }, []);

  // online/offline
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // capture & run prediction
  const handleCapture = async () => {
    setCaptureError(null);
    if (!ready.model || !ready.camera) {
      setCaptureError("Waiting for camera/model...");
      return;
    }
    const video = videoRef.current || bgVideoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // if online, try Vision API first
    try {
      if (isOnline) {
        setServiceUsed("vision");
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        
        const response = await fetch('http://localhost:3000/vision-ai', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ image: dataUrl })
        });

        if (!response.ok) {
          throw new Error('Vision API request failed');
        }

        const result = await response.json();
        if (result.labels && result.labels.length > 0) {
          const bestMatch = result.labels[0];
          setPrediction({ label: bestMatch.description, score: bestMatch.score, probs: null });
          try { tracker.startViewing(bestMatch.description); } catch (e) { console.warn(e); }
          await fetchDescription(bestMatch.description);
          return;
        }
      }

      // fallback to local model
      setServiceUsed("local");
      const { topK, probs } = await predict(canvas);
      const top = topK[0];
      const predictedLabel = LABELS[top.index] ?? `class-${top.index}`;
      setPrediction({ label: predictedLabel, score: top.score, probs });
      // start tracking viewing for admin analytics
      try { tracker.startViewing(predictedLabel); } catch (e) { console.warn(e); }
      await fetchDescription(predictedLabel);
    } catch (err) {
      console.error("Prediction error:", err);
      const msg = err?.message || String(err) || "Unknown prediction error";
      setCaptureError(msg);
      setDescription(`Prediction failed: ${msg}`);
    }
  };

  // stop any active viewing timer on unmount
  useEffect(() => {
    return () => {
      try { tracker.stopViewing(); } catch (e) { /* ignore */ }
    };
  }, []);

  // Old Google Vision direct call removed - now using backend endpoint

  // fetch description (try Gemini online -> fallback to local file)
  const fetchDescription = async (artTitle) => {
    const key = import.meta.env.VITE_GEMINI_API_KEY;
    // helper map for local story/audio filenames
    const fname = artTitle.replace(/\s+/g, "_");
    try {
      if (isOnline && key) {
        const prompt = `Give a museum-style introduction to "${artTitle}" including artist, year, style, and significance.`;
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=your key`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          }
        );
        const j = await res.json();
        const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          setDescription(text);
          return;
        }
      }
      // fallback to local file in public/stories/
      const fallbackRes = await fetch(`/stories/${fname}.txt`);
      if (fallbackRes.ok) {
        const txt = await fallbackRes.text();
        setDescription(txt);
      } else {
        setDescription("No description available.");
      }
    } catch (err) {
      console.warn("Gemini/local fetch error:", err);
      setDescription("No description available.");
    }
  };

  // audio toggle (web speech if online + description, else local mp3)
  const toggleAudio = () => {
    if (!description) return;
    if (audioPlaying) {
      window.speechSynthesis.cancel();
      audioRef.current.pause();
      setAudioPlaying(false);
      return;
    }

    if (isOnline) {
      const u = new SpeechSynthesisUtterance(description);
      u.onend = () => setAudioPlaying(false);
      window.speechSynthesis.speak(u);
      setAudioPlaying(true);
    } else {
      // try common filename variants for offline audio files
      const raw = (prediction?.label ?? "").toLowerCase();
      const variants = [raw.replace(/\s+/g, "_"), raw.replace(/\s+/g, ""), raw];
      let played = false;
      (async () => {
        for (const v of variants) {
          const path = `/audio/${v}.mp3`;
          try {
            audioRef.current.src = path;
            await audioRef.current.play();
            setAudioPlaying(true);
            played = true;
            audioRef.current.onended = () => setAudioPlaying(false);
            break;
          } catch (e) {
            // try next
          }
        }
        if (!played) console.error("Audio play failed for variants:", variants);
      })();
    }
  };

  return (
    <div className="app-root" style={{ height: "100vh", overflow: "hidden", position: "relative", background: "#000" }}>
      {/* Large centered header */}
      <div className="top-header">
        <h1 className="title-text">ArtVista Explorer</h1>
        <div style={{display:'flex', alignItems:'center'}}>
          <span className="status-pill" style={{marginLeft:12, pointerEvents:'auto'}}>{isOnline ? (serviceUsed ? `Online • ${serviceUsed}` : 'Online') : 'Offline'}</span>
          <button onClick={() => setAdminOpen(true)} style={{marginLeft:12, padding:'6px 10px', borderRadius:8, background:'#222', color:'#fff', border:'1px solid #444'}}>Admin</button>
        </div>
      </div>
      {/* capture error banner */}
      {captureError && (
        <div style={{position:'absolute', top:86, left:12, right:12, zIndex:120, background:'#ffefef', color:'#6b0b0b', padding:'8px 12px', borderRadius:10, textAlign:'center'}}>
          {captureError}
        </div>
      )}
      {/* Video background */}
  <video ref={bgVideoRef} className="video-bg" playsInline muted autoPlay />
      <div className="bg-overlay" />

      {/* Centered medium preview */}
      <div className="camera-wrapper">
        <div className="camera-frame">
          <video ref={videoRef} className="camera-view" playsInline muted autoPlay />
        </div>

        {/* Capture button placed under the preview */}
        <button onClick={handleCapture} className="capture-circle" aria-label="Capture photo">📸</button>
      </div>

      {/* Bottom slider */}
      <AnimatePresence>
        {prediction && (
          <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", stiffness: 120 }} className="bottom-sheet">
            <div className="label-row">
              <div>
                <h2 style={{ margin: 0 }}>{prediction.label}</h2>
                <div className="confidence">Confidence: {(prediction.score * 100).toFixed(1)}%</div>
              </div>
              <div>
                <button onClick={toggleAudio} className="audio-btn">
                  {audioPlaying ? "⏹ Stop" : "🔊 Listen"}
                </button>
              </div>
            </div>
            <hr style={{ margin: "12px 0", border: "none", height: 1, background: "#eee" }} />
            <div className="description-text">{description || "Loading description..."}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin login modal / dashboard */}
      {adminOpen && (
        <div style={{position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)'}}>
          <div style={{width:420, maxWidth:'94%', background:'#fff', borderRadius:12, padding:20}}>
            {isAdmin ? (
              <div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8}}>
                  <div>
                    <h3 style={{margin:0}}>Admin Dashboard</h3>
                    <div style={{fontSize:12, color:'#666'}}>Total time spent: {fmtSeconds(adminTotalSeconds)}</div>
                  </div>
                  <div>
                    <button onClick={() => { setIsAdmin(false); sessionStorage.removeItem('artmuseum_isAdmin'); }} style={{marginRight:8}}>Logout</button>
                    <button onClick={() => setAdminOpen(false)}>Close</button>
                  </div>
                </div>
                <AdminDashboard />
              </div>
            ) : (
              <div>
                <h3 style={{marginTop:0}}>Admin Login</h3>
                <p>Enter admin password to view analytics.</p>
                <input autoFocus value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} type="password" placeholder="Password" style={{width:'100%', padding:8, borderRadius:6, border:'1px solid #ddd'}}/>
                <div style={{display:'flex', justifyContent:'flex-end', marginTop:12}}>
                  <button onClick={() => setAdminOpen(false)} style={{marginRight:8}}>Cancel</button>
                  <button onClick={() => {
                    if (adminPassword === 'artmuseum123') {
                      sessionStorage.setItem('artmuseum_isAdmin', '1');
                      setIsAdmin(true);
                      setAdminPassword('');
                      setAdminTotalSeconds(tracker.getActivity().totalSeconds || 0);
                    } else {
                      alert('Incorrect password');
                    }
                  }}>Login</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* update admin total when modal opens or isAdmin changes */}
      {adminOpen && isAdmin && (() => {
        setTimeout(() => {
          try { setAdminTotalSeconds(tracker.getActivity().totalSeconds || 0); } catch (e) {}
        }, 50);
        return null;
      })()}

      {/* hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
