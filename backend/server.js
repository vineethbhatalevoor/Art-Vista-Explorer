import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load Google credentials and JWT library
import jwt from 'jsonwebtoken';

const GOOGLE_CREDENTIALS = JSON.parse(fs.readFileSync(resolve(__dirname, 'google-credentials.json'), 'utf8'));

// Helper to get Google auth token
async function getGoogleAuthToken() {
  const now = Math.floor(Date.now() / 1000);
  
  const claims = {
    iss: GOOGLE_CREDENTIALS.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  // Sign JWT with private key
  const signedJWT = jwt.sign(claims, GOOGLE_CREDENTIALS.private_key, { algorithm: 'RS256' });
  
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedJWT}`
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Token request failed: ${error}`);
    }

    const { access_token } = await response.json();
    if (!access_token) throw new Error('No access token in response');
    
    return access_token;
  } catch (error) {
    console.error('Failed to get access token:', error);
    throw error;
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ dest: "uploads/" });

// Vision AI endpoint using Google Cloud Vision API
app.post("/vision-ai", async (req, res) => {
  try {
    console.log('📸 Received Vision AI request');
    const { image } = req.body;
    if (!image) {
      console.error('❌ No image provided in request');
      return res.status(400).json({ error: "No image provided" });
    }

    console.log('🔑 Getting auth token...');
    let authToken;
    try {
      authToken = await getGoogleAuthToken();
      console.log('✅ Got auth token');
    } catch (error) {
      console.error('❌ Auth token error:', error);
      return res.status(500).json({ error: 'Authentication failed: ' + error.message });
    }

    // Prepare request to Google Cloud Vision API
    const requestBody = {
      requests: [{
        image: {
          content: image.replace(/^data:image\/(png|jpeg|jpg);base64,/, '')
        },
        features: [{
          type: "LABEL_DETECTION",
          maxResults: 10
        }, {
          type: "OBJECT_LOCALIZATION",
          maxResults: 10
        }]
      }]
    };

    console.log('🔄 Sending request to Google Vision API...');
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Google Vision API Error:', errorText);
      throw new Error(`Google Vision API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    if (!result.responses || !result.responses[0]) {
      console.error('❌ Invalid Vision API response:', result);
      throw new Error('Invalid response format from Vision API');
    }
    
    console.log('✅ Received Google Vision response:', JSON.stringify(result.responses[0], null, 2));

    // Combine label and object detection results
    const labels = [
      ...(result.responses[0].labelAnnotations || []).map(label => ({
        description: label.description,
        score: label.score,
        type: 'label'
      })),
      ...(result.responses[0].localizedObjectAnnotations || []).map(obj => ({
        description: obj.name,
        score: obj.score,
        type: 'object'
      }))
    ];

    // Process art-specific concepts
    const artLabels = labels.map(label => {
      const desc = label.description.toLowerCase();
      const isSpecificArtwork = 
        desc.includes('mona lisa') ||
        desc.includes('starry night') ||
        desc.includes('the scream') ||
        desc.includes('painting') ||
        desc.includes('artwork') ||
        desc.includes('canvas') ||
        desc.includes('museum') ||
        desc.includes('art');
        
      return {
        description: label.description,
        score: isSpecificArtwork ? Math.min(1, label.score * 1.2) : label.score,
        type: label.type
      };
    });

    // Get top predictions, prioritizing art-related labels
    const topLabels = artLabels
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    console.log('✅ Vision analysis complete. Top labels:', topLabels);
    res.json({ labels: topLabels });
  } catch (error) {
    console.error('Vision AI Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Original predict endpoint for fallback
app.post("/api/predict", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const predictedArtwork = "Mona Lisa";
  const artistStoryAudio = "/audios/mona_lisa.mp3";
  res.json({ predictedArtwork, artistStoryAudio });
});

app.post("/gemini", async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ error: "No title provided" });
    }

    // Read the corresponding story file
    const storyFileName = title.toLowerCase().replace(/\s+/g, '_') + '.txt';
    const storyPath = resolve(__dirname, 'stories', storyFileName);
    
    if (fs.existsSync(storyPath)) {
      const storyText = fs.readFileSync(storyPath, 'utf8');
      res.json({ text: storyText });
    } else {
      res.json({ text: "Story not found for this artwork." });
    }
  } catch (error) {
    console.error('Gemini Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.use("/audios", express.static(resolve(__dirname, "audios")));

const PORT = 3000;
const server = app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`❌ Port ${PORT} is already in use.`);
    process.exit(1);
  }
  throw err;
});