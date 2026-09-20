import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyserNode, isRecording }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 32;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationId = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barCount = 32;
      const barWidth = 3.5;
      const gap = (width - barCount * barWidth) / (barCount - 1);

      if (isRecording && analyserNode) {
        analyserNode.getByteFrequencyData(dataArray);

        for (let i = 0; i < barCount; i++) {
          const binIndex = Math.floor((i / barCount) * bufferLength * 0.6);
          const rawValue = dataArray[binIndex] || 0;
          const percent = rawValue / 255;
          const barHeight = Math.max(4, percent * height * 0.95);
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          // Nigerian Green to Mint to White gradient
          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
          gradient.addColorStop(0, '#34d399'); // Mint
          gradient.addColorStop(0.5, '#008751'); // Nigerian Green
          gradient.addColorStop(1, '#ffffff'); // White tip

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
      } else {
        // Subtle resting wave
        const time = Date.now() * 0.002;
        for (let i = 0; i < barCount; i++) {
          const wave = Math.sin(time + i * 0.25);
          const barHeight = 4 + (wave + 1) * 2;
          const x = i * (barWidth + gap);
          const y = (height - barHeight) / 2;

          ctx.fillStyle = '#1e382b'; // Deep emerald slate
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, 2);
          ctx.fill();
        }
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyserNode, isRecording]);

  return (
    <div className="w-full flex items-center justify-center py-1">
      <canvas
        ref={canvasRef}
        width={300}
        height={36}
        className="w-full max-w-xs h-9"
      />
    </div>
  );
};
