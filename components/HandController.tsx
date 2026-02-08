// components/HandController.tsx
"use client";

import React, { useEffect, useRef, useState, memo } from "react";
import Webcam from "react-webcam";

interface HandControllerProps {
  onHandMove: (landmarks: any) => void;
}

const HandController = memo(({ onHandMove }: HandControllerProps) => {
  const webcamRef = useRef<Webcam>(null);
  const requestRef = useRef<number>(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  
  const handsRef = useRef<any>(null); 
  const isComponentMounted = useRef(true);

  // DETECT MOBILE
  useEffect(() => {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    const mobileCheck = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    if (mobileCheck) {
        console.log("Mobile detected: Disabling Hand Tracking for Spectator Mode.");
        setIsMobile(true);
    }
  }, []);

  useEffect(() => {
    if (isMobile) return; 

    isComponentMounted.current = true;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js";
    script.async = true;
    script.crossOrigin = "anonymous";

    script.onload = () => {
      if (!isComponentMounted.current) return;
      const Hands = (window as any).Hands;
      if (Hands) {
        const hands = new Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
        });
        hands.setOptions({
          maxNumHands: 1, modelComplexity: 0, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5,
        });
        hands.onResults((results: any) => {
          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            onHandMove(results.multiHandLandmarks[0]);
          }
        });
        handsRef.current = hands;
        setIsLoaded(true);
      }
    };
    document.body.appendChild(script);
    return () => {
      isComponentMounted.current = false;
      if (document.body.contains(script)) document.body.removeChild(script);
      if (handsRef.current) { handsRef.current.close(); handsRef.current = null; }
    };
  }, [isMobile]);

  // ANIMATION LOOP
  useEffect(() => {
    if (!isLoaded || isMobile) return; 
    const tick = async () => {
      if (!isComponentMounted.current) return;
      if (webcamRef.current && webcamRef.current.video && webcamRef.current.video.readyState === 4 && handsRef.current) {
        try { await handsRef.current.send({ image: webcamRef.current.video }); } 
        catch (err) { console.warn("MediaPipe frame skipped"); }
      }
      requestRef.current = requestAnimationFrame(tick);
    };
    requestRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(requestRef.current);
  }, [isLoaded, isMobile]);

  if (isMobile) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "0",
        top: "0",
        width: "1px",
        height: "1px",
        opacity: 0.01,
        pointerEvents: "none",
        zIndex: 2147483647,
        overflow: "hidden"
      }}
    >
      <Webcam ref={webcamRef} width={640} height={480} mirrored={true} screenshotFormat="image/jpeg" />
    </div>
  );
});

HandController.displayName = "HandController";
export default HandController;