#!/usr/bin/env node

const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { spawn, exec } = require('child_process');
const http = require('http');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = 3001;

// Enable CORS for the web app
app.use(cors());
app.use(express.json());

// Serve static files from the built SPA
app.use(express.static(path.join(__dirname, 'static')));

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({ status: 'ok', version: '1.0.0' });
});

// Get namespaces
app.get('/namespaces', async (req, res) => {
	const context = req.query.context;

	// Validate required context parameter
	if (!context) {
		return res.status(400).json({ error: 'Context parameter is required' });
	}

	// Build kubectl command with context
	const sanitizedContext = context.replace(/[^a-zA-Z0-9_\-\.@]/g, '');
	const cmd = `kubectl get namespaces --context ${sanitizedContext} -o json`;

	exec(cmd, (error, stdout, stderr) => {
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

// Get pods in a namespace
app.get('/pods', async (req, res) => {
	const namespace = req.query.namespace;
	const context = req.query.context;

	// Validate required context parameter
	if (!context) {
		return res.status(400).json({ error: 'Context parameter is required' });
	}
	// Validate required namespace parameter
	if (!namespace) {
		return res.status(400).json({ error: 'Namespace parameter is required' });
	}

	// Build kubectl command with context
	const sanitizedContext = context.replace(/[^a-zA-Z0-9_\-\.@]/g, '');
	const cmd = `kubectl get pods -n ${namespace} --context ${sanitizedContext} -o json`;

	exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
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

// Get pod details
app.get('/pods/:name', (req, res) => {
	const { name } = req.params;
	const context = req.query.context;
	const namespace = req.query.namespace;

	// Validate required context parameter
	if (!context) {
		return res.status(400).json({ error: 'Context parameter is required' });
	}
	// Validate required namespace parameter
	if (!namespace) {
		return res.status(400).json({ error: 'Namespace parameter is required' });
	}

	// Build kubectl command with context
	const sanitizedContext = context.replace(/[^a-zA-Z0-9_\-\.@]/g, '');
	const cmd = `kubectl get pod ${name} -n ${namespace} --context ${sanitizedContext} -o json`;

	exec(cmd, (error, stdout, stderr) => {
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
app.get('/events/:name', (req, res) => {
	const { name } = req.params;
	const context = req.query.context;
	const namespace = req.query.namespace;

	// Validate required context parameter
	if (!context) {
		return res.status(400).json({ error: 'Context parameter is required' });
	}
	// Validate required namespace parameter
	if (!namespace) {
		return res.status(400).json({ error: 'Namespace parameter is required' });
	}

	// Build kubectl command with context
	const sanitizedContext = context.replace(/[^a-zA-Z0-9_\-\.@]/g, '');
	const cmd = `kubectl get events -n ${namespace} --field-selector involvedObject.name=${name} --context ${sanitizedContext} -o json`;

	exec(cmd, (error, stdout, stderr) => {
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
			console.error('Error while getting events data:', parseError);
			res.status(500).json({ error: 'Failed to parse events data' });
		}
	});
});

// Get available kubectl contexts
app.get('/contexts', async (req, res) => {
	exec('kubectl config get-contexts -o name', (error, stdout, stderr) => {
		if (error) {
			console.error(`Error fetching contexts: ${error}`);
			return res.status(500).json({ error: 'Failed to fetch contexts', details: stderr });
		}

		try {
			const contexts = stdout
				.trim()
				.split('\n')
				.filter((context) => context.trim() !== '')
				.map((context) => context.trim());
			res.json(contexts);
		} catch (parseError) {
			console.error('Error parsing contexts data:', parseError);
			res.status(500).json({ error: 'Failed to parse contexts data' });
		}
	});
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
		} catch {
			res.json({
				available: true,
				version: 'unknown'
			});
		}
	});
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server for log streaming
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
	console.log('WebSocket client connected');
	const logSessions = new Map();

	const sendSessionMessage = (sessionId, message, type = 'log') => {
		const payload = JSON.stringify({
			sessionId,
			type,
			message,
			timestamp: new Date().toISOString()
		});
		ws.send(payload);
	};

	const stopSession = (sessionId) => {
		const session = logSessions.get(sessionId);
		if (session) {
			session.process.kill();
			logSessions.delete(sessionId);
			sendSessionMessage(sessionId, 'Session stopped', 'info');
			console.log(`Stopped log session ${sessionId}`);
		}
	};

	ws.on('message', (message) => {
		try {
			const data = JSON.parse(message);

			if (data.action === 'start') {
				const { namespace, pod, tailLines, context, container, sessionId } = data;
				const finalSessionId = sessionId || crypto.randomUUID();

				// Stop existing session with same ID if it exists
				if (logSessions.has(finalSessionId)) {
					stopSession(finalSessionId);
				}

				// Validate required context parameter
				if (!context) {
					sendSessionMessage(finalSessionId, 'Context parameter is required', 'error');
					return;
				}

				// Sanitize inputs to prevent command injection
				const sanitizedNamespace = namespace.replace(/[^a-zA-Z0-9_-]/g, '');
				const sanitizedPod = pod.replace(/[^a-zA-Z0-9_.'-]/g, '');
				const sanitizedContainer = container ? container.replace(/[^a-zA-Z0-9_.'-]/g, '') : null;
				const sanitizedTailLines = Math.min(Math.max(1, parseInt(tailLines) || 100), 10000);
				const sanitizedContext = context.replace(/[^a-zA-Z0-9_.@'-]/g, '');

				console.log(
					`Starting log session ${finalSessionId} for pod ${sanitizedPod}${sanitizedContainer ? ` container ${sanitizedContainer}` : ''} in namespace ${sanitizedNamespace} with context ${sanitizedContext}`
				);

				// Start kubectl logs with follow flag
				const args = [
					'logs',
					'-f', // follow
					'-n',
					sanitizedNamespace,
					sanitizedPod,
					'--tail',
					sanitizedTailLines.toString(),
					'--context',
					sanitizedContext
				];

				// Add container flag if specified
				if (sanitizedContainer) {
					args.push('-c', sanitizedContainer);
				}

				const logProcess = spawn('kubectl', args);

				// Store session info
				logSessions.set(finalSessionId, {
					process: logProcess,
					namespace: sanitizedNamespace,
					pod: sanitizedPod,
					container: sanitizedContainer,
					context: sanitizedContext,
					startTime: new Date().toISOString()
				});

				// Send session started confirmation
				sendSessionMessage(
					finalSessionId,
					`Log session started for ${sanitizedPod}${sanitizedContainer ? ` (${sanitizedContainer})` : ''}`,
					'info'
				);

				// Stream stdout to WebSocket
				logProcess.stdout.on('data', (data) => {
					const lines = data.toString().split('\n');
					lines.forEach((line) => {
						if (line.trim()) {
							sendSessionMessage(finalSessionId, line, 'log');
						}
					});
				});

				// Stream stderr to WebSocket
				logProcess.stderr.on('data', (data) => {
					sendSessionMessage(finalSessionId, data.toString(), 'error');
				});

				logProcess.on('error', (error) => {
					sendSessionMessage(finalSessionId, `Failed to start kubectl: ${error.message}`, 'error');
					logSessions.delete(finalSessionId);
				});

				logProcess.on('close', (code) => {
					if (code !== 0 && code !== null) {
						sendSessionMessage(finalSessionId, `kubectl process exited with code ${code}`, 'info');
					}
					logSessions.delete(finalSessionId);
				});
			} else if (data.action === 'stop') {
				const { sessionId } = data;
				if (!sessionId) {
					ws.send(
						JSON.stringify({
							type: 'error',
							message: 'Session ID is required for stop action',
							timestamp: new Date().toISOString()
						})
					);
					return;
				}
				stopSession(sessionId);
			} else if (data.action === 'list') {
				const sessions = Array.from(logSessions.entries()).map(([id, session]) => ({
					sessionId: id,
					namespace: session.namespace,
					pod: session.pod,
					container: session.container,
					context: session.context,
					startTime: session.startTime
				}));
				ws.send(
					JSON.stringify({
						type: 'sessions',
						sessions,
						timestamp: new Date().toISOString()
					})
				);
			} else if (data.action === 'stopAll') {
				const sessionIds = Array.from(logSessions.keys());
				sessionIds.forEach(stopSession);
				ws.send(
					JSON.stringify({
						type: 'info',
						message: `Stopped ${sessionIds.length} sessions`,
						timestamp: new Date().toISOString()
					})
				);
			}
		} catch (error) {
			console.error('Error processing WebSocket message:', error);
			ws.send(
				JSON.stringify({
					type: 'error',
					message: error.message,
					timestamp: new Date().toISOString()
				})
			);
		}
	});

	ws.on('close', () => {
		console.log('WebSocket client disconnected');
		// Stop all sessions for this connection
		logSessions.forEach((session, sessionId) => {
			session.process.kill();
			console.log(`Cleaned up session ${sessionId}`);
		});
		logSessions.clear();
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
