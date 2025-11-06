// Google Cloud Vision AI integration
const BACKEND_URL = 'http://localhost:3000';

export const analyzeImageWithVisionAI = async (imageData) => {
  try {
    // Check if we're online
    if (!navigator.onLine) {
      throw new Error('Offline - falling back to local model');
    }

    // Convert imageData (canvas/image) to base64
    let base64Image;
    if (imageData instanceof HTMLCanvasElement) {
      base64Image = imageData.toDataURL('image/jpeg').split(',')[1];
    } else if (imageData instanceof HTMLImageElement) {
      const canvas = document.createElement('canvas');
      canvas.width = imageData.width;
      canvas.height = imageData.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageData, 0, 0);
      base64Image = canvas.toDataURL('image/jpeg').split(',')[1];
    } else {
      throw new Error('Unsupported image input type');
    }

    console.log('🔄 Sending image to Vision AI...', base64Image.substring(0, 100) + '...');
    
    // Send to backend for Vision AI processing
    const response = await fetch(`${BACKEND_URL}/vision-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: base64Image
      })
    });
    
    console.log('📥 Vision AI Response Status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Vision AI Error Response:', errorText);
      throw new Error(`Vision AI API request failed: ${errorText}`);
    }

    const data = await response.json();
    console.log('Vision AI Raw Response:', data);
    
    if (!data.labels || !data.labels.length) {
      throw new Error('No labels returned from Vision AI');
    }
    
    // Format response to match our model's output structure
    const labels = data.labels;
    const probs = new Float32Array(labels.length);
    
    // Process labels to identify artwork
    const artworkLabels = labels.filter(label => {
      const desc = label.description.toLowerCase();
      return desc.includes('painting') || 
             desc.includes('artwork') || 
             desc.includes('art') ||
             desc.includes('portrait') ||
             desc.includes('canvas') ||
             desc.includes('museum') ||
             desc.includes('mona lisa') ||
             desc.includes('van gogh') ||
             desc.includes('masterpiece');
    });
    
    // Use artwork-specific labels if found, otherwise use top labels
    const relevantLabels = artworkLabels.length > 0 ? artworkLabels : labels;
    
    const topK = relevantLabels
      .map((label, index) => {
        probs[index] = label.score;
        return {
          index: index,
          score: label.score,
          label: label.description
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    
    console.log('Vision AI results:', topK);

    return { probs, topK };
  } catch (error) {
    console.warn('Vision AI Error:', error.message);
    throw error; // Let caller handle fallback to local model
  }
};