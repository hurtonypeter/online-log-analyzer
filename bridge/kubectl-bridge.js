// kubectl-bridge.js - Local bridge server for kubectl commands
// Run this server locally to enable kubectl access from the web app

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { spawn, exec } = require('child_process');
const http = require('http');

const app = express();
const PORT = 3001;

// Enable CORS for the web app
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({ status: 'ok', version: '1.0.0' });
});

// Get pods in a namespace
app.get('/pods', async (req, res) => {
	const namespace = req.query.namespace || 'default';

	exec(`kubectl get pods -n ${namespace} -o json`, (error, stdout, stderr) => {
		if (error) {
			console.error(`Error fetching pods: ${error}`);
			return res.status(500).json({ error: 'Failed to fetch pods', details: stderr });
		}

		try {
			const podsData = JSON.parse(stdout);
			const pods = podsData.items.map((pod) => ({
				name: pod.metadata.name,
				status: pod.status.phase,
				ready: pod.status.conditions?.find((c) => c.type === 'Ready')?.status === 'True',
				containers: pod.spec.containers.map((c) => c.name),
				restartCount: pod.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0
			}));

			res.json(pods);
		} catch (parseError) {
			console.error('Error parsing pods data:', parseError);
			res.status(500).json({ error: 'Failed to parse pods data' });
		}
	});
});

// Get namespaces
app.get('/namespaces', async (req, res) => {
	exec('kubectl get namespaces -o json', (error, stdout, stderr) => {
		if (error) {
			console.error(`Error fetching namespaces: ${error}`);
			return res.status(500).json({ error: 'Failed to fetch namespaces', details: stderr });
		}

		try {
			const nsData = JSON.parse(stdout);
			const namespaces = nsData.items.map((ns) => ns.metadata.name);
			res.json(namespaces);
		} catch (parseError) {
			console.error('Error parsing namespace data:', parseError);
			res.status(500).json({ error: 'Failed to parse namespace data' });
		}
	});
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server for log streaming
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
	console.log('WebSocket client connected');
	let logProcess = null;

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);

			if (data.action === 'start') {
				// Stop any existing process
				if (logProcess) {
					logProcess.kill();
				}

				const { namespace, pod, tailLines } = data;

				// Sanitize inputs to prevent command injection
				const sanitizedNamespace = namespace.replace(/[^a-zA-Z0-9_\-]/g, '');
				const sanitizedPod = pod.replace(/[^a-zA-Z0-9_\-\.]/g, '');
				const sanitizedTailLines = Math.min(Math.max(1, parseInt(tailLines) || 100), 10000);

				console.log(
					`Starting log stream for pod ${sanitizedPod} in namespace ${sanitizedNamespace}`
				);

				// Start kubectl logs with follow flag
				const args = [
					'logs',
					'-f', // follow
					'-n',
					sanitizedNamespace,
					sanitizedPod,
					'--tail',
					sanitizedTailLines.toString()
				];

				logProcess = spawn('kubectl', args);

				// Stream stdout to WebSocket
				logProcess.stdout.on('data', (data) => {
					const lines = data.toString().split('\n');
					lines.forEach((line) => {
						if (line.trim()) {
							ws.send(line);
						}
					});
				});

				// Stream stderr to WebSocket
				logProcess.stderr.on('data', (data) => {
					ws.send(`[ERROR] ${data.toString()}`);
				});

				logProcess.on('error', (error) => {
					ws.send(`[ERROR] Failed to start kubectl: ${error.message}`);
				});

				logProcess.on('close', (code) => {
					if (code !== 0 && code !== null) {
						ws.send(`[INFO] kubectl process exited with code ${code}`);
					}
				});
			} else if (data.action === 'stop') {
				if (logProcess) {
					logProcess.kill();
					logProcess = null;
				}
			}
		} catch (error) {
			console.error('Error processing WebSocket message:', error);
			ws.send(`[ERROR] ${error.message}`);
		}
	});

	ws.on('close', () => {
		console.log('WebSocket client disconnected');
		if (logProcess) {
			logProcess.kill();
		}
	});
});

// Advanced endpoints for additional functionality

// Get pod details
app.get('/pod/:namespace/:name', (req, res) => {
	const { namespace, name } = req.params;

	exec(`kubectl get pod ${name} -n ${namespace} -o json`, (error, stdout, stderr) => {
		if (error) {
			return res.status(500).json({ error: 'Failed to fetch pod details', details: stderr });
		}

		try {
			const podData = JSON.parse(stdout);
			res.json(podData);
		} catch (parseError) {
			res.status(500).json({ error: 'Failed to parse pod data' });
		}
	});
});

// Get recent pod events
app.get('/events/:namespace/:name', (req, res) => {
	const { namespace, name } = req.params;

	exec(
		`kubectl get events -n ${namespace} --field-selector involvedObject.name=${name} -o json`,
		(error, stdout, stderr) => {
			if (error) {
				return res.status(500).json({ error: 'Failed to fetch events', details: stderr });
			}

			try {
				const eventsData = JSON.parse(stdout);
				const events = eventsData.items.map((event) => ({
					type: event.type,
					reason: event.reason,
					message: event.message,
					firstTimestamp: event.firstTimestamp,
					lastTimestamp: event.lastTimestamp,
					count: event.count
				}));
				res.json(events);
			} catch (parseError) {
				res.status(500).json({ error: 'Failed to parse events data' });
			}
		}
	);
});

// Check kubectl availability
app.get('/check-kubectl', (req, res) => {
	exec('kubectl version --client -o json', (error, stdout, stderr) => {
		if (error) {
			return res.status(500).json({
				available: false,
				error: 'kubectl not found or not configured',
				details: stderr
			});
		}

		try {
			const versionData = JSON.parse(stdout);
			res.json({
				available: true,
				version: versionData.clientVersion
			});
		} catch (parseError) {
			res.json({
				available: true,
				version: 'unknown'
			});
		}
	});
});

// Start server
server.listen(PORT, () => {
	console.log(`
    ╔════════════════════════════════════════════════╗
    ║                                                ║
    ║   Kubectl Bridge Server Running!               ║
    ║                                                ║
    ║   Port: ${PORT}                                   ║
    ║   Health: http://localhost:${PORT}/health         ║
    ║   WebSocket: ws://localhost:${PORT}/stream        ║
    ║                                                ║
    ║   Your web app can now access kubectl!         ║
    ║                                                ║
    ╚════════════════════════════════════════════════╝
    `);

	// Check if kubectl is available
	exec('kubectl version --client', (error) => {
		if (error) {
			console.warn('\n⚠️  Warning: kubectl not found or not configured properly');
			console.log('   Make sure kubectl is installed and configured with your cluster\n');
		} else {
			console.log('✅ kubectl is available and configured\n');
		}
	});
});
