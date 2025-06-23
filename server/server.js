const express = require('express');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = 3000;

const wss = new WebSocket.Server({ port: 3001 });

wss.on('connection', (ws) => {
  console.log('New client connected');
  ws.on('error', (err) => {
    console.error(`WebSocket error: ${err.message}`);
});

  
  const python = spawn('python', [
  '-W', 'ignore', // ignore Python warnings
  path.join(__dirname, 'python/pupil_analysis.py')
], {
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    TF_CPP_MIN_LOG_LEVEL: '3' // suppress TensorFlow info/warning logs
  }
});
  python.on('exit', (code, signal) => {
    console.error(`Python process exited with code ${code}, signal ${signal}`);
    ws.send(JSON.stringify({ status: 'error', message: 'Python script crashed' }));
});


  // Buffer management
  let buffer = '';
  python.stdout.on('data', (data) => {
    data.toString().split('\n').forEach((line) => {
        if (line.trim()) {
            try {
                ws.send(JSON.stringify(JSON.parse(line))); // Validate JSON before sending
            } catch (error) {
                console.error('Malformed Python output:', error);
            }
        }
    });
});


  python.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (!msg.includes('XNNPACK')) {
        console.error('Python error:', msg);
        ws.send(JSON.stringify({ status: 'error', message: msg })); // Send error to client
    }
});

python.on('exit', (code, signal) => {
    console.error(`Python process exited with code ${code}, signal ${signal}`);
});


  ws.on('message', (message) => {
    try {
      const { frame } = JSON.parse(message);
      if (frame && python.stdin.writable) {
        python.stdin.write(`${frame}\n`);
      }
    } catch (error) {
      console.error('Message error:', error);
    }
  });

  ws.on('close', () => {
    setTimeout(() => {
        if (!python.killed) {
            python.kill();
        }
        console.log('Client disconnected, Python process terminated.');
}, 500);
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});