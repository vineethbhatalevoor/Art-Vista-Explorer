// frontend/src/utils/model.js
import * as tf from "@tensorflow/tfjs";
import { analyzeImageWithVisionAI } from './visionAI';

let model = null;
let modelLoaded = false;
let modelInputShape = [224, 224]; // default fallback

/**
 * Robust loader: try GraphModel first then LayersModel.
 * Detects input shape if available and caches model.
 */
export const loadModel = async () => {
  if (model && modelLoaded) return model;
  try {
    console.log("⏳ Loading TFJS model (graph/layers) from /model/model.json ...");
    try {
      model = await tf.loadGraphModel("/model/model.json");
      console.log("✅ Loaded GraphModel");
    } catch (err) {
      console.warn("GraphModel load failed, trying LayersModel:", err.message || err);
      model = await tf.loadLayersModel("/model/model.json");
      console.log("✅ Loaded LayersModel");
    }

    // try to detect input shape [null, H, W, C] or [H,W,C]
    try {
      const inputs = model.inputs || (model.modelSignature && model.modelSignature.inputs);
      if (inputs && inputs.length) {
        const shape = inputs[0].shape || (inputs[0].tensorShape && inputs[0].tensorShape.dim && inputs[0].tensorShape.dim.map(d=>d.size));
        if (Array.isArray(shape)) {
          // find height/width among dims (skip batch dim if present)
          const dims = shape.filter((d) => d && d > 1);
          if (dims.length >= 2) {
            // dims often look like [H, W, C] after removing batch. Use first two as [H,W].
            modelInputShape = [dims[0], dims[1]];
          }
        }
      }
    } catch (e) {
      console.debug("Could not detect model input shape, using fallback", e);
    }

    modelLoaded = true;
    console.log("Model ready. Input shape:", modelInputShape);
    return model;
  } catch (err) {
    console.error("❌ Error loading model:", err);
    modelLoaded = false;
    throw err;
  }
};

/**
 * Predict helper
 * Accepts HTMLCanvasElement / HTMLImageElement / tf.Tensor4D
 * Returns: { probs: Float32Array, topK: [{index,score}] }
 */
export const predict = async (input) => {
  // Try Vision AI first if online
  try {
    const result = await analyzeImageWithVisionAI(input);
    console.log('✅ Using Google Vision AI');
    return result;
  } catch (err) {
    console.log('⚠️ Falling back to local model:', err.message);
    // Fall back to local model
    return predictLocal(input);
  }
};

/**
 * Local model prediction
 */
const predictLocal = async (input) => {
  if (!modelLoaded || !model) {
    throw new Error("Model not loaded yet!");
  }

  // convert input -> tensor
  let tensor;
  if (input instanceof tf.Tensor) {
    tensor = input;
  } else {
    tensor = tf.browser.fromPixels(input);
  }

  const [h, w] = modelInputShape || [224, 224];
  const resized = tf.image.resizeBilinear(tensor, [h, w]).toFloat();
  const normalized = resized.div(255.0);
  const batched = normalized.expandDims(0); // [1,h,w,3]

  // run model
  let out;
  try {
    if (model.predict) {
      out = model.predict(batched);
    } else if (model.execute) {
      try {
        out = model.execute(batched);
      } catch (e) {
        // some GraphModels expect a dict keyed by input name -> try that
        const inputName = (model.inputs && model.inputs[0] && model.inputs[0].name) || null;
        if (inputName) {
          try {
            const dict = {};
            dict[inputName] = batched;
            out = model.execute(dict);
          } catch (e2) {
            throw e2;
          }
        } else {
          throw e;
        }
      }
    }
  } catch (e) {
    // ensure cleanup for tensors we created before bubbling error
    tf.dispose([tensor, resized, normalized, batched]);
    throw e;
  }

  if (!out) {
    tf.dispose([tensor, resized, normalized, batched]);
    throw new Error("Model returned no output");
  }

  // handle array or tensor output
  let logits = Array.isArray(out) ? out[0] : out;

  // ensure we have a Tensor
  if (!logits || !logits.dataSync) {
    tf.dispose([tensor, resized, normalized, batched]);
    throw new Error("Unexpected model output format");
  }

  // compute probabilities via softmax for stability
  const probsTensor = tf.softmax(logits);
  const probsArr = await probsTensor.data();

  // cleanup
  tf.dispose([tensor, resized, normalized, batched, logits, probsTensor]);

  const probs = Array.from(probsArr);
  const sorted = probs
    .map((p, i) => ({ index: i, score: p }))
    .sort((a, b) => b.score - a.score);
  const topK = sorted.slice(0, 3);

  return { probs: new Float32Array(probs), topK };
};
