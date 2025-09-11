<script lang="ts">
	import { page } from '$app/state';

	interface Props {
		onLogMessage?: (message: string) => void;
	}

	let { onLogMessage }: Props = $props();

	const bridgeUrl = page.url.searchParams.get('bridgeUrl');
	console.log('Bridge URL:', bridgeUrl);

	interface LogTailing {
		podName: string;
		context: string;
		namespace: string;
		active: boolean;
		sessionId?: string;
		container?: string;
	}

	interface SessionMessage {
		sessionId: string;
		type: 'log' | 'error' | 'info' | 'sessions';
		message: string;
		timestamp: string;
	}

	interface Pod {
		name: string;
		status: string;
		ready: boolean;
		containers: string[];
		restartCount: number;
	}

	let logTailings: LogTailing[] = $state([]);
	let showAddPopup = $state(false);
	let contexts: string[] = $state([]);
	let namespaces: string[] = $state([]);
	let pods: Pod[] = $state([]);
	let selectedContext = $state('');
	let selectedNamespace = $state('');
	let selectedPod = $state('');
	let loading = $state({
		contexts: false,
		namespaces: false,
		pods: false
	});

	// WebSocket connection and session management
	let ws: WebSocket | null = $state(null);
	let wsConnected = $state(false);
	let connectionAttempts = $state(0);
	const MAX_RECONNECT_ATTEMPTS = 5;

	async function fetchContexts() {
		loading.contexts = true;
		try {
			const response = await fetch(`${bridgeUrl}/contexts`);
			if (response.ok) {
				contexts = await response.json();
			}
		} catch (error) {
			console.error('Failed to fetch contexts:', error);
		}
		loading.contexts = false;
	}

	async function fetchNamespaces(context: string) {
		if (!context) return;
		loading.namespaces = true;
		namespaces = [];
		selectedNamespace = '';
		pods = [];
		selectedPod = '';

		try {
			const response = await fetch(
				`${bridgeUrl}/namespaces?context=${encodeURIComponent(context)}`
			);
			if (response.ok) {
				namespaces = await response.json();
			}
		} catch (error) {
			console.error('Failed to fetch namespaces:', error);
		}
		loading.namespaces = false;
	}

	async function fetchPods(context: string, namespace: string) {
		if (!context || !namespace) return;
		loading.pods = true;
		pods = [];
		selectedPod = '';

		try {
			const response = await fetch(
				`${bridgeUrl}/pods?context=${encodeURIComponent(context)}&namespace=${encodeURIComponent(namespace)}`
			);
			if (response.ok) {
				pods = await response.json();
			}
		} catch (error) {
			console.error('Failed to fetch pods:', error);
		}
		loading.pods = false;
	}

	function openAddPopup() {
		showAddPopup = true;
		selectedContext = '';
		selectedNamespace = '';
		selectedPod = '';
		contexts = [];
		namespaces = [];
		pods = [];
		fetchContexts();
	}

	function closeAddPopup() {
		showAddPopup = false;
	}

	function addLogTailing() {
		if (selectedContext && selectedNamespace && selectedPod) {
			const newTailing: LogTailing = {
				podName: selectedPod,
				context: selectedContext,
				namespace: selectedNamespace,
				active: false
			};

			const exists = logTailings.some(
				(t) =>
					t.podName === newTailing.podName &&
					t.context === newTailing.context &&
					t.namespace === newTailing.namespace
			);

			if (!exists) {
				logTailings = [...logTailings, newTailing];
			}
			closeAddPopup();
		}
	}

	// WebSocket connection management
	function connectWebSocket() {
		if (!bridgeUrl || ws) return;

		// Construct WebSocket URL properly
		const wsUrl = bridgeUrl.replace('http://', 'ws://').replace('https://', 'wss://');

		try {
			ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				console.log('WebSocket connected');
				wsConnected = true;
				connectionAttempts = 0;
			};

			ws.onmessage = (event) => {
				try {
					const data: SessionMessage = JSON.parse(event.data);
					console.log('WebSocket message:', data);

					// Handle log messages by calling the callback
					if (data.type === 'log' && onLogMessage) {
						onLogMessage(data.message);
					}

					// Find the tailing associated with this session
					const tailing = logTailings.find((t) => t.sessionId === data.sessionId);
					if (tailing && data.type === 'info' && data.message.includes('stopped')) {
						tailing.active = false;
						tailing.sessionId = undefined;
					}
				} catch (error) {
					console.log('WebSocket raw message:', event.data);
				}
			};

			ws.onclose = () => {
				console.log('WebSocket disconnected');
				wsConnected = false;
				ws = null;

				// Mark all tailings as inactive
				logTailings = logTailings.map((tailing) => ({
					...tailing,
					active: false,
					sessionId: undefined
				}));

				// Attempt to reconnect
				if (connectionAttempts < MAX_RECONNECT_ATTEMPTS) {
					connectionAttempts++;
					setTimeout(connectWebSocket, 2000 * connectionAttempts);
				}
			};

			ws.onerror = (error) => {
				console.error('WebSocket error:', error);
			};
		} catch (error) {
			console.error('Failed to create WebSocket connection:', error);
		}
	}

	function disconnectWebSocket() {
		if (ws) {
			ws.close();
			ws = null;
			wsConnected = false;

			// Mark all tailings as inactive
			logTailings = logTailings.map((tailing) => ({
				...tailing,
				active: false,
				sessionId: undefined
			}));
		}
	}

	function sendWebSocketMessage(message: any) {
		if (ws && wsConnected) {
			ws.send(JSON.stringify(message));
		} else {
			console.warn('WebSocket not connected');
		}
	}

	function removeTailing(index: number) {
		const tailing = logTailings[index];
		if (tailing) {
			stopTailing(tailing);
			logTailings = logTailings.filter((_, i) => i !== index);
		}
	}

	function stopTailing(tailing: LogTailing) {
		if (tailing.sessionId && ws && wsConnected) {
			sendWebSocketMessage({
				action: 'stop',
				sessionId: tailing.sessionId
			});
		}
		tailing.active = false;
		tailing.sessionId = undefined;
	}

	function startTailing(tailing: LogTailing) {
		if (!ws || !wsConnected) {
			console.warn('WebSocket not connected');
			return;
		}

		// Generate a unique session ID
		const sessionId = `${tailing.context}-${tailing.namespace}-${tailing.podName}-${Date.now()}`;

		sendWebSocketMessage({
			action: 'start',
			sessionId,
			context: tailing.context,
			namespace: tailing.namespace,
			pod: tailing.podName,
			container: tailing.container,
			tailLines: 100
		});

		tailing.active = true;
		tailing.sessionId = sessionId;
	}

	// Lifecycle effects
	$effect(() => {
		if (bridgeUrl && !ws && !wsConnected) {
			connectWebSocket();
		}
	});

	// Separate effect for cleanup
	$effect(() => {
		// Cleanup on unmount
		return () => {
			disconnectWebSocket();
		};
	});

	$effect(() => {
		if (selectedContext) {
			fetchNamespaces(selectedContext);
		}
	});

	$effect(() => {
		if (selectedContext && selectedNamespace) {
			fetchPods(selectedContext, selectedNamespace);
		}
	});
</script>

<div class="mx-auto max-w-4xl">
	{#if !bridgeUrl}
		<div class="">
			<h2 class="mb-4 text-sm font-semibold text-gray-800">Log Tailing Manager</h2>
			<p class="text-xs text-gray-600">
				This feature requires <br />a running bridge.
			</p>
		</div>
	{:else}
		<div class="mb-2 flex items-center justify-between gap-4">
			<div class="flex items-center gap-2">
				<h2 class="text-sm font-semibold text-gray-800">Log Tailing Manager</h2>
				<div class="flex items-center gap-1">
					<div
						class={`h-2 w-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}
						title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
					></div>
					<span class="text-xs text-gray-500">
						{wsConnected ? 'Connected' : 'Disconnected'}
					</span>
				</div>
			</div>
			<button
				class="text-md cursor-pointer text-blue-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400"
				onclick={openAddPopup}
				disabled={!wsConnected}
				title={wsConnected ? 'Add new log tailing' : 'WebSocket connection required'}
			>
				+
			</button>
		</div>

		<div class="flex flex-col gap-1">
			{#if logTailings.length === 0}
				<div class="rounded bg-gray-50 py-8 text-center text-gray-500">
					No log tailings configured. Click "Add New" to get started.
				</div>
			{/if}

			{#each logTailings as tailing, index}
				<div class="flex items-start justify-between">
					<div class="flex-1">
						<div class="text-md mb-1 text-gray-800">
							{tailing.podName} <br />
							<span class="text-xs">({tailing.context}/{tailing.namespace})</span>
						</div>
					</div>
					<div class="flex items-center gap-1">
						{#if tailing.active}
							<button
								class="text-md cursor-pointer text-blue-500 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-gray-400"
								onclick={() => stopTailing(tailing)}
								disabled={!wsConnected}
								title="Stop log tailing"
							>
								⏸
							</button>
						{:else}
							<button
								class="text-md cursor-pointer text-green-500 hover:text-green-700 disabled:cursor-not-allowed disabled:text-gray-400"
								onclick={() => startTailing(tailing)}
								disabled={!wsConnected}
								title="Start log tailing"
							>
								▶
							</button>
						{/if}
						<button
							class="text-md cursor-pointer text-red-500 hover:text-red-700"
							onclick={() => removeTailing(index)}
							title="Remove log tailing"
						>
							✕
						</button>
					</div>
				</div>
			{/each}
		</div>

		{#if showAddPopup}
			<div
				class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				onkeydown={(e) => e.key === 'Escape' && closeAddPopup()}
			>
				<div class="w-full max-w-md rounded-lg bg-white opacity-100 shadow-lg" role="document">
					<div class="flex items-center justify-between border-b border-gray-200 p-4">
						<h3 class="text-lg font-semibold text-gray-800">Add New Log Tailing</h3>
						<button
							class="flex h-8 w-8 items-center justify-center text-2xl text-gray-400 hover:text-gray-600"
							onclick={closeAddPopup}
						>
							×
						</button>
					</div>

					<div class="p-4">
						<div class="mb-4">
							<label for="context-select" class="mb-1 block font-medium text-gray-700"
								>Context:</label
							>
							<select
								id="context-select"
								class="w-full rounded border border-gray-300 p-2 text-base disabled:bg-gray-100 disabled:text-gray-500"
								bind:value={selectedContext}
								disabled={loading.contexts}
							>
								<option value="">Select context...</option>
								{#each contexts as context}
									<option value={context}>{context}</option>
								{/each}
							</select>
							{#if loading.contexts}
								<div class="mt-1 text-sm text-gray-500 italic">Loading contexts...</div>
							{/if}
						</div>

						<div class="mb-4">
							<label for="namespace-select" class="mb-1 block font-medium text-gray-700"
								>Namespace:</label
							>
							<select
								id="namespace-select"
								class="w-full rounded border border-gray-300 p-2 text-base disabled:bg-gray-100 disabled:text-gray-500"
								bind:value={selectedNamespace}
								disabled={!selectedContext || loading.namespaces}
							>
								<option value="">Select namespace...</option>
								{#each namespaces as namespace}
									<option value={namespace}>{namespace}</option>
								{/each}
							</select>
							{#if loading.namespaces}
								<div class="mt-1 text-sm text-gray-500 italic">Loading namespaces...</div>
							{/if}
						</div>

						<div class="mb-4">
							<label for="pod-select" class="mb-1 block font-medium text-gray-700">Pod:</label>
							<select
								id="pod-select"
								class="w-full rounded border border-gray-300 p-2 text-base disabled:bg-gray-100 disabled:text-gray-500"
								bind:value={selectedPod}
								disabled={!selectedNamespace || loading.pods}
							>
								<option value="">Select pod...</option>
								{#each pods as pod}
									<option value={pod.name}>{pod.name} ({pod.status})</option>
								{/each}
							</select>
							{#if loading.pods}
								<div class="mt-1 text-sm text-gray-500 italic">Loading pods...</div>
							{/if}
						</div>
					</div>

					<div class="flex justify-end gap-2 border-t border-gray-200 p-4">
						<button
							class="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
							onclick={closeAddPopup}
						>
							Cancel
						</button>
						<button
							class="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
							onclick={addLogTailing}
							disabled={!selectedContext || !selectedNamespace || !selectedPod}
						>
							Add
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
