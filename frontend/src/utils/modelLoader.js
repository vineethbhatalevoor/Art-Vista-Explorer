// frontend/src/utils/modelLoader.js
import * as tf from '@tensorflow/tfjs';

let model = null;

export const loadModel = async () => {
  if (model) return model; // avoid reloading
  try {
    model = await tf.loadLayersModel('/model/model.json');
    console.log('✅ Model loaded successfully');
    return model;
  } catch (error) {
    console.error('❌ Error loading model:', error);
    throw error;
  }
};

export const predictImage = async (imageElement) => {
  if (!model) {
    await loadModel();
  }

  // Convert image to tensor
  const tensor = tf.browser
    .fromPixels(imageElement)
    .resizeNearestNeighbor([224, 224]) // resize to model input shape
    .toFloat()
    .expandDims();

  const prediction = model.predict(tensor);
  const data = await prediction.data();
  tf.dispose([tensor, prediction]); // cleanup
  return data;
};
