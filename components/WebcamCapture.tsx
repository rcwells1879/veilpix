/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect, useState } from 'react';
import { CameraIcon, ChevronLeftIcon } from './icons';
import Spinner from './Spinner';

interface WebcamCaptureProps {
  onCapture: (file: File) => void;
  onBack: () => void;
}

const WebcamCapture: React.FC<WebcamCaptureProps> = ({ onCapture, onBack }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const startWebcam = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user'
          }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing webcam:", err);
        let message = 'Could not access the webcam.';
        if (err instanceof Error) {
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            message = 'Webcam access was denied. Please allow camera permission in your browser settings.';
          } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            message = 'No webcam was found. Please ensure a camera is connected and enabled.';
          }
        }
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    startWebcam();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    if (context) {
      // Flip the image horizontally for a mirror effect, so the captured image matches the preview
      context.translate(canvas.width, 0);
      context.scale(-1, 1);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(blob => {
        if (blob) {
          const file = new File([blob], `webcam-${Date.now()}.png`, { type: 'image/png' });
          onCapture(file);
        }
      }, 'image/png');
    }
  };

  if (error) {
    return (
      <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
        <h2 className="text-2xl font-bold text-red-300">Webcam Error</h2>
        <p className="text-md text-red-400">{error}</p>
        <button
          onClick={onBack}
          className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors mt-4"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
      <div className="relative shadow-2xl rounded-xl overflow-hidden bg-black/20 inline-block">
        {isLoading && (
          <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4">
            <Spinner />
            <p className="text-gray-300">Starting webcam...</p>
          </div>
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`max-w-full max-h-[70vh] transform scale-x-[-1] transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
          onCanPlay={() => setIsLoading(false)}
        />
        <canvas ref={canvasRef} className="hidden" />
      </div>

      <div className="flex items-center justify-center gap-4 w-full">
         <button
          onClick={onBack}
          className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-4 px-6 rounded-lg transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
          aria-label="Go back"
        >
          <ChevronLeftIcon className="w-5 h-5 mr-2" />
          Back
        </button>
        <button
          onClick={handleCapture}
          disabled={isLoading}
          className="flex-grow flex items-center justify-center bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-lg disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
          aria-label="Capture photo"
        >
          <CameraIcon className="w-6 h-6 mr-3" />
          Capture Photo
        </button>
      </div>
    </div>
  );
};

export default WebcamCapture;
