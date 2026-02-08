class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._chunkSize = Math.max(800, Math.round(sampleRate / 10)); // ~100ms

    // --- simple voice activity gating ---
    this._speech = false;
    this._hangover = 0;
    this._hangoverChunks = 4; // ~400ms tail so words don't get clipped
    this._rmsThreshold = 0.015; // tweak: 0.01–0.03 depending on mic/environment
  }

  process(inputs) {
    const input = inputs[0];
    const channel = input?.[0];
    if (!channel) return true;

    // compute RMS for this frame
    let sum = 0;
    for (let i = 0; i < channel.length; i++) sum += channel[i] * channel[i];
    const rms = Math.sqrt(sum / channel.length);

    const hasSpeech = rms >= this._rmsThreshold;
    if (hasSpeech) {
      this._speech = true;
      this._hangover = this._hangoverChunks;
    } else if (this._hangover > 0) {
      this._hangover--;
    } else {
      this._speech = false;
    }

    // Only buffer when speech is active (or hangover)
    if (!this._speech) return true;

    for (let i = 0; i < channel.length; i++) {
      this._buffer.push(channel[i]);
    }

    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._chunkSize);
      this._buffer = this._buffer.slice(this._chunkSize);

      const pcm16 = new Int16Array(this._chunkSize);
      for (let i = 0; i < this._chunkSize; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      this.port.postMessage({ type: "audio_chunk", data: pcm16.buffer }, [
        pcm16.buffer,
      ]);
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
