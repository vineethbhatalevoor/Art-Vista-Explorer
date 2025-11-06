import React, { useRef, useState, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";

export default function CameraView() {
  const videoRef = useRef(null);
  const [model, setModel] = useState(null);
  const [output, setOutput] = useState("Waiting for input...");

  useEffect(() => {
    async function setupCamera() {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoRef.current.srcObject = stream;
    }
    setupCamera();

    async function loadModel() {
      const loadedModel = await tf.loadLayersModel("/public/model/model.json");
      setModel(loadedModel);
      console.log("Model loaded successfully");
    }
    loadModel();
  }, []);

  const captureAndPredict = async () => {
    if (!model) return alert("Model not loaded yet");
    const video = videoRef.current;

    const tensor = tf.browser
      .fromPixels(video)
      .resizeNearestNeighbor([224, 224])
      .toFloat()
      .expandDims();
    const predictions = model.predict(tensor);
    const data = await predictions.data();
    const classes = ["Mona Lisa", "The Scream", "Starry Night"];
    const idx = data.indexOf(Math.max(...data));

    const predictedClass = classes[idx];
    setOutput(`Recognized: ${predictedClass}`);

    // Simple audio playback
    const audioMap = {
      "Mona Lisa": "/audio/monalisa.mp3",
      "The Scream": "/audio/scream.mp3",
      "Starry Night": "/audio/starry_night.mp3",
    };

    const audio = new Audio(audioMap[predictedClass]);
    audio.play();
  };

  return (
    <div style={{ textAlign: "center", padding: 20 }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        width="320"
        height="240"
        style={{ borderRadius: "12px" }}
      ></video>

      <div style={{ marginTop: 20 }}>
        <button
          onClick={captureAndPredict}
          style={{
            background: "#1e90ff",
            color: "white",
            border: "none",
            borderRadius: "50%",
            width: 70,
            height: 70,
            fontSize: 18,
            cursor: "pointer",
          }}
        >
          📸
        </button>
      </div>

      <p style={{ marginTop: 20 }}>{output}</p>
    </div>
  );
}
