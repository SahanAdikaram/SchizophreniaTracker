import { useState, useEffect, useRef } from 'react';
import { Chart as ChartJS, LineElement, PointElement, LinearScale, CategoryScale, Tooltip } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

export default function SchizophreniaTracker() {
  const [metrics, setMetrics] = useState([]);
  const [status, setStatus] = useState('Initializing...');
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRef = useRef(null);

  // Ensure latestMetrics is safely accessed
  const latestMetrics = metrics.length > 0 ? metrics[metrics.length - 1] : null;

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');
    let animationId;

    const startTracking = async () => {
      try {
        setStatus('Accessing camera...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' }
        });

        if (!videoRef.current) {
          console.error("videoRef is not initialized.");
          return;
        }

        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch(err => console.error("Video playback error:", err));
        };

        setStatus('Tracking started');
        processFrame();
      } catch (error) {
        console.error("Camera error:", error);
        setStatus(`Error: ${error.message}`);
      }
    };

    const processFrame = () => {
      if (videoRef.current && videoRef.current.readyState === 4) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        ctx.drawImage(videoRef.current, 0, 0);

        try {
          ws.send(JSON.stringify({
            frame: canvas.toDataURL('image/jpeg', 0.8)
          }));
        } catch (error) {
          console.error("WebSocket send error:", error);
        }
      }
      animationId = requestAnimationFrame(processFrame);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status === 'success') {
        setMetrics(prev => [...prev.slice(-30), data]);
        updateOverlay(data);
      }
    };

    ws.onerror = () => setStatus('Connection error');
    ws.onclose = () => {
      cancelAnimationFrame(animationId);
      console.log("WebSocket closed.");
    };

    startTracking();

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      
      cancelAnimationFrame(animationId);

      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }

      console.log("Cleanup completed, video stopped.");
    };
  }, []);

  const updateOverlay = (data) => {
    const canvas = overlayRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw pupil circle
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = data.pupil_diameter * 10; // Scaled for visibility

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.strokeStyle = data.clinical_markers.hyperarousal ? '#ff5252' : '#4caf50';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw clinical indicators
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';

    // Pupil diameter (change color to green)
ctx.fillStyle = '#00ff00';  // Green color
ctx.fillText(
  `Pupil: ${data.pupil_diameter.toFixed(1)}mm`, 
  20, 30
);

// Gaze stability bar
ctx.fillStyle = data.clinical_markers.attentional_deficit ? '#ff9800' : '#2196f3';
ctx.fillRect(20, 50, data.gaze_stability * 100, 10);

// Stability text (keep it white or change if needed)
ctx.fillStyle = '#ff0000';
ctx.fillText(
  `Stability: ${(data.gaze_stability * 100).toFixed(0)}%`,
  20, 80
);

  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Schizophrenia Pupillometry & Gaze Tracker</h1>
      <div style={styles.status}>{status}</div>
      
      <div style={styles.content}>
        {/* Video Feed with Overlay */}
        <div style={styles.videoContainer}>
          <video ref={videoRef} muted autoPlay style={{ width: '100%', height: '100%', display: 'block' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <canvas 
            ref={overlayRef}
            style={styles.overlay}
            width={640}
            height={480}
          />
        </div>
        
        {/* Clinical Dashboard */}
        <div style={styles.dashboard}>
          <div style={styles.chartContainer}>
            <Line
              data={{
                labels: metrics.map((_, i) => i),
                datasets: [
                  {
                    label: 'Pupil Diameter (mm)',
                    data: metrics.map(m => m.pupil_diameter),
                    borderColor: '#ff5252',
                    tension: 0.1,
                    yAxisID: 'y'
                  },
                  {
                    label: 'Gaze Stability (%)',
                    data: metrics.map(m => m.gaze_stability * 100),
                    borderColor: '#2196f3',
                    tension: 0.1,
                    yAxisID: 'y1'
                  }
                ]
              }}
              options={{
                responsive: true,
                interaction: { mode: 'index' },
                scales: {
                  y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'Diameter (mm)' },
                    min: 3,
                    max: 8,
                    ticks: { stepSize: 1 }
                  },
                  y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Stability (%)' },
                    min: 0,
                    max: 100,
                    grid: { drawOnChartArea: false }
                  }
                }
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: { maxWidth: '1200px', margin: '0 auto', padding: '20px', fontFamily: 'Roboto, sans-serif' },
  title: { textAlign: 'center', color: '#333', marginBottom: '10px' },
  status: { textAlign: 'center', marginBottom: '20px', color: '#666' },
  content: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' },
  videoContainer: { position: 'relative', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000' },
  overlay: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  dashboard: { backgroundColor: '#fff', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' },
};
