import { FocusMetric } from '../types/index.js';
import { FOCUS_THRESHOLDS } from './focusConfig.js';

export class FocusDetectionEngine {
  private videoElement: HTMLVideoElement | null = null;
  private faceMesh: any = null;
  private isRunning: boolean = false;
  private animFrameId: number | null = null;
  private onScoreCallback: ((metric: FocusMetric) => void) | null = null;
  private currentScore: number = 0;
  private scoreHistory: number[] = [];
  private lastCalculationTime: number = 0;
  private isProcessing = false;

  constructor() {
    this.initMediaPipe();
  }

  private initMediaPipe() {
    if (typeof window !== 'undefined' && (window as any).FaceMesh) {
      try {
        const FaceMeshClass = (window as any).FaceMesh;
        this.faceMesh = new FaceMeshClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
        });

        this.faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        this.faceMesh.onResults(this.onMediaPipeResults.bind(this));
        console.log('[AI Focus] MediaPipe Face Mesh initialized successfully');
      } catch (err) {
        console.warn('[AI Focus] MediaPipe initialization error, using heuristic fallback:', err);
      }
    }
  }

  public start(video: HTMLVideoElement, onScore: (metric: FocusMetric) => void) {
    this.videoElement = video;
    this.onScoreCallback = onScore;
    this.currentScore = 0;
    this.scoreHistory = [];
    this.lastCalculationTime = 0;
    this.isRunning = true;
    this.processLoop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  private processLoop = async () => {
    if (!this.isRunning || !this.videoElement) return;

    const now = Date.now();
    // Process at ~5 to 10 FPS for optimal performance without taxing CPU
    if (now - this.lastCalculationTime >= 150) {
      this.lastCalculationTime = now;

      if (this.videoElement.readyState >= 2 && !this.videoElement.paused && !this.isProcessing) {
        if (this.faceMesh) {
          try {
            this.isProcessing = true;
            await this.faceMesh.send({ image: this.videoElement });
          } catch (e) {
            this.emitUnavailableMetric();
          } finally {
            this.isProcessing = false;
          }
        } else {
          this.emitUnavailableMetric();
        }
      }
    }

    this.animFrameId = requestAnimationFrame(this.processLoop);
  };

  private onMediaPipeResults(results: any) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
      // No face detected -> Distracted / Away from screen
      this.updateTemporalScore(0);
      this.emitMetric({
        score: Math.round(this.currentScore),
        category: this.getCategory(this.currentScore),
        faceDetected: false,
        headYaw: 0,
        headPitch: 0,
        gazeDirection: 'away',
      });
      return;
    }

    const landmarks = results.multiFaceLandmarks[0];

    // Key facial points
    // Nose tip: 4, Chin: 152, Left eye: 33, Right eye: 263, Forehead: 10
    const nose = landmarks[4];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const chin = landmarks[152];
    const forehead = landmarks[10];

    // 1. Head Yaw (Horizontal turn)
    // Compare nose horizontal position relative to midpoint between eyes
    const eyeDistance = Math.max(Math.abs(rightEye.x - leftEye.x), 0.001);
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const yawOffset = Math.abs(nose.x - eyeMidX) / eyeDistance;
    const headOrientationScore = Math.max(0, 1 - Math.min(yawOffset / 0.42, 1));

    // 2. Head Pitch (Looking down at phone / notes vs up at screen)
    const eyeMidY = (leftEye.y + rightEye.y) / 2;
    const faceHeight = Math.max(Math.abs(chin.y - forehead.y), 0.001);
    const noseRelativeY = (nose.y - eyeMidY) / faceHeight;
    const pitchScore = Math.max(0, 1 - Math.min(Math.abs(noseRelativeY - 0.37) / 0.28, 1));

    // 3. Eye Aspect Ratio (EAR) approximation for openness
    // Left eye upper (159) & lower (145), Right eye upper (386) & lower (374)
    const leftEar = this.eyeAspectRatio(landmarks[159], landmarks[145], leftEye, rightEye);
    const rightEar = this.eyeAspectRatio(landmarks[386], landmarks[374], rightEye, leftEye);
    const eyeOpenScore = Math.min((leftEar + rightEar) / 2 / 0.18, 1);
    const gazeScore = this.getGazeScore(landmarks, leftEye, rightEye);
    const targetScore = 100 * (0.25 + headOrientationScore * 0.3 + pitchScore * 0.2 + eyeOpenScore * 0.15 + gazeScore * 0.1);
    this.updateTemporalScore(targetScore);

    this.emitMetric({
      score: Math.round(this.currentScore),
      category: this.getCategory(this.currentScore),
      faceDetected: true,
      ear: Number(leftEar.toFixed(3)),
        headYaw: Number((yawOffset * 100).toFixed(1)),
      headPitch: Number((noseRelativeY * 100).toFixed(1)),
        gazeDirection: gazeScore >= 0.65 ? 'center' : gazeScore >= 0.35 ? 'uncertain' : 'away',
    });
  }

  private eyeAspectRatio(upper: any, lower: any, eye: any, otherEye: any): number {
    if (!upper || !lower) return 0;
    return Math.abs(upper.y - lower.y) / Math.max(Math.abs(otherEye.x - eye.x) * 0.4, 0.001);
  }

  private getGazeScore(landmarks: any[], leftEye: any, rightEye: any): number {
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    if (!leftIris || !rightIris) return 0.5;
    const leftRatio = (leftIris.x - leftEye.x) / Math.max(rightEye.x - leftEye.x, 0.001);
    const rightRatio = (rightIris.x - leftEye.x) / Math.max(rightEye.x - leftEye.x, 0.001);
    const centered = ((leftRatio + rightRatio) / 2);
    return Math.max(0, 1 - Math.min(Math.abs(centered - 0.5) / 0.35, 1));
  }

  private updateTemporalScore(targetScore: number) {
    this.scoreHistory.push(Math.max(0, Math.min(100, targetScore)));
    if (this.scoreHistory.length > 12) this.scoreHistory.shift();
    const average = this.scoreHistory.reduce((sum, score) => sum + score, 0) / this.scoreHistory.length;
    this.currentScore = this.currentScore * 0.6 + average * 0.4;
  }

  private emitUnavailableMetric() {
    this.updateTemporalScore(0);
    this.emitMetric({
      score: Math.round(this.currentScore),
      category: this.getCategory(this.currentScore),
      faceDetected: false,
      gazeDirection: 'unavailable',
    });
  }

  private getCategory(score: number): 'focused' | 'moderate' | 'low' | 'distracted' {
    if (score >= FOCUS_THRESHOLDS.focused) return 'focused';
    if (score >= FOCUS_THRESHOLDS.moderate) return 'moderate';
    if (score >= 30) return 'low';
    return 'distracted';
  }

  private emitMetric(metric: FocusMetric) {
    if (this.onScoreCallback) {
      this.onScoreCallback(metric);
    }
  }
}
