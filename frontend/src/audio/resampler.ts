/**
 * Linear interpolation audio resampler.
 * Accurately converts audio samples from any native browser sample rate (e.g. 48000Hz or 44100Hz)
 * down to the required 16,000Hz mono stream.
 */
export function resampleTo16kHz(
  inputData: Float32Array,
  sourceSampleRate: number
): Float32Array {
  const targetSampleRate = 16000;
  if (sourceSampleRate === targetSampleRate) {
    return inputData;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const newLength = Math.round(inputData.length / ratio);
  const result = new Float32Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originPos = i * ratio;
    const index = Math.floor(originPos);
    const nextIndex = Math.min(index + 1, inputData.length - 1);
    const fraction = originPos - index;

    // Linear interpolation between consecutive samples
    result[i] = inputData[index] * (1 - fraction) + inputData[nextIndex] * fraction;
  }

  return result;
}
