/**
 * AudioWorkletProcessor for extracting raw audio samples in ~32ms chunks (512 samples at 16kHz).
 */
class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // 512 samples at 16kHz = 32ms chunk
    this.chunkSize = 512;
    this.buffer = new Float32Array(this.chunkSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];

      if (this.bufferIndex >= this.chunkSize) {
        // Send a copy of the buffer to the main thread
        this.port.postMessage(this.buffer.slice(0, this.chunkSize));
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('pcm-worklet-processor', PCMWorkletProcessor);
