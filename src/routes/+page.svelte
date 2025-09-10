<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import FilterExpression from '$lib/FilterExpression.svelte';
	import {
		FilterParser,
		type FilterExpression as FilterExpressionType
	} from '$lib/filterParser.js';

	let logInput = $state('');
	let parsedLogs = $state<any[]>([]);
	let filteredLogs = $state<any[]>([]);
	let columns = $state([{ id: 'line', name: 'Raw Line', field: '__raw__', hidden: false }]);
	let newFieldName = $state('');
	let draggedColumn: number | null = null;
	let selectedLog = $state<any>(null);
	let sidebarOpen = $state(false);
	let sortState = $state<{ column: string; direction: 'asc' | 'desc' } | null>(null);
	let filterExpressions = $state<FilterExpressionType[]>([]);

	const STORAGE_KEY = 'loganalyzer-columns';
	const SORT_STORAGE_KEY = 'loganalyzer-sort';
	const INPUT_STORAGE_KEY = 'loganalyzer-input';
	const FILTERS_STORAGE_KEY = 'loganalyzer-filters';

	function saveColumnsToStorage() {
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
			} catch (error) {
				console.warn('Failed to save columns to localStorage:', error);
			}
		}
	}

	function loadColumnsFromStorage() {
		if (browser) {
			try {
				const saved = localStorage.getItem(STORAGE_KEY);
				if (saved) {
					const parsedColumns = JSON.parse(saved);
					// Ensure we always have the default Raw Line column
					const hasRawLine = parsedColumns.some((col: any) => col.field === '__raw__');
					if (!hasRawLine) {
						parsedColumns.push({ id: 'line', name: 'Raw Line', field: '__raw__', hidden: false });
					}
					columns = parsedColumns;
				}
			} catch (error) {
				console.warn('Failed to load columns from localStorage:', error);
			}
		}
	}

	function saveSortToStorage() {
		if (browser && sortState) {
			try {
				localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sortState));
			} catch (error) {
				console.warn('Failed to save sort state to localStorage:', error);
			}
		}
	}

	function loadSortFromStorage() {
		if (browser) {
			try {
				const saved = localStorage.getItem(SORT_STORAGE_KEY);
				if (saved) {
					sortState = JSON.parse(saved);
				}
			} catch (error) {
				console.warn('Failed to load sort state from localStorage:', error);
			}
		}
	}

	function saveInputToStorage() {
		if (browser) {
			try {
				localStorage.setItem(INPUT_STORAGE_KEY, logInput);
			} catch (error) {
				console.warn('Failed to save log input to localStorage:', error);
			}
		}
	}

	function saveFiltersToStorage() {
		if (browser) {
			try {
				localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filterExpressions));
			} catch (error) {
				console.warn('Failed to save filters to localStorage:', error);
			}
		}
	}

	function loadFiltersFromStorage() {
		if (browser) {
			try {
				const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
				if (saved) {
					filterExpressions = JSON.parse(saved);
				}
			} catch (error) {
				console.warn('Failed to load filters from localStorage:', error);
			}
		}
	}

	function loadInputFromStorage() {
		if (browser) {
			try {
				const saved = localStorage.getItem(INPUT_STORAGE_KEY);
				if (saved) {
					logInput = saved;
				} else {
					// Provide sample data for new users
					logInput =
						'{"foo":{"bar":1}, "baz": 3, "zip": 32, "array": [{"meh": 49}, {"meh": 50}]}\n{"foo":{"bar":2}, "baz": 4}\n{"foo":{"bar":3}, "baz": 5}\n{"foo":{"bar":4}, "baz": 6}';
				}
			} catch (error) {
				console.warn('Failed to load log input from localStorage:', error);
			}
		}
	}

	function parseLogLines(input: string) {
		const lines = input.split('\n').filter((line) => line.trim());
		const logs: any[] = [];

		for (const line of lines) {
			try {
				const parsed = JSON.parse(line.trim());
				logs.push({ ...parsed, __raw__: line.trim() });
			} catch {
				// Skip non-JSON lines silently
			}
		}

		parsedLogs = logs;
		updateFilteredLogs();
	}

	function updateFilteredLogs() {
		// Apply filters first
		const filtered = FilterParser.applyFilters(parsedLogs, filterExpressions);

		// Apply sorting if it exists
		if (sortState) {
			filteredLogs = applySorting(filtered, sortState.column, sortState.direction);
		} else {
			filteredLogs = filtered;
		}
	}

	function addColumn() {
		if (newFieldName.trim()) {
			const id = Date.now().toString();
			const newColumn = {
				id,
				name: newFieldName.trim(),
				field: newFieldName.trim(),
				hidden: false
			};

			// Find the index of the raw line column
			const rawLineIndex = columns.findIndex((col) => col.field === '__raw__');

			// Insert new column before the raw line column
			const newColumns = [...columns];
			newColumns.splice(rawLineIndex, 0, newColumn);
			columns = newColumns;

			newFieldName = '';
		}
	}

	function removeColumn(index: number) {
		if (columns[index].field !== '__raw__') {
			columns = columns.filter((_, i) => i !== index);
		}
	}

	function toggleColumnVisibility(index: number) {
		const newColumns = [...columns];
		newColumns[index].hidden = !newColumns[index].hidden;
		columns = newColumns;
	}

	function getNestedValue(obj: any, path: string): any {
		if (path === '__raw__') return obj.__raw__;

		// Handle array indexing like "array[0].prop" or "array[0]"
		const parts = path.split('.');
		let current = obj;

		for (const part of parts) {
			if (current == null) return '';

			// Check if this part has array indexing
			const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
			if (arrayMatch) {
				const [, arrayName, index] = arrayMatch;
				current = current[arrayName];
				if (Array.isArray(current) && parseInt(index) < current.length) {
					current = current[parseInt(index)];
				} else {
					return '';
				}
			} else {
				current = current[part];
			}
		}

		return current ?? '';
	}

	function applySorting(logs: any[], columnField: string, direction: 'asc' | 'desc') {
		return [...logs].sort((a, b) => {
			const aVal = getNestedValue(a, columnField);
			const bVal = getNestedValue(b, columnField);

			if (typeof aVal === 'string' && typeof bVal === 'string') {
				return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
			}

			return direction === 'asc' ? (aVal > bVal ? 1 : -1) : bVal > aVal ? 1 : -1;
		});
	}

	function sortColumn(columnField: string, direction: 'asc' | 'desc') {
		sortState = { column: columnField, direction };
		updateFilteredLogs();
		saveSortToStorage();
	}

	function handleDragStart(index: number) {
		draggedColumn = index;
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}

	function handleDrop(event: DragEvent, targetIndex: number) {
		event.preventDefault();
		if (draggedColumn !== null && draggedColumn !== targetIndex) {
			const newColumns = [...columns];
			const [draggedItem] = newColumns.splice(draggedColumn, 1);
			newColumns.splice(targetIndex, 0, draggedItem);
			columns = newColumns;
		}
		draggedColumn = null;
	}

	function selectLog(log: any) {
		selectedLog = log;
		sidebarOpen = true;
	}

	function closeSidebar() {
		sidebarOpen = false;
		selectedLog = null;
	}

	async function copyToClipboard(text: string) {
		try {
			await navigator.clipboard.writeText(text);
		} catch (error) {
			console.warn('Failed to copy to clipboard:', error);
			// Fallback for older browsers
			const textArea = document.createElement('textarea');
			textArea.value = text;
			document.body.appendChild(textArea);
			textArea.select();
			document.execCommand('copy');
			document.body.removeChild(textArea);
		}
	}

	function addFilterExpression(filter: FilterExpressionType | null = null) {
		filter ??= {
			id: Date.now().toString(),
			expression: '',
			enabled: true
		};
		filterExpressions = [...filterExpressions, filter];
	}

	function updateFilterExpression(updatedFilter: FilterExpressionType) {
		const index = filterExpressions.findIndex((f) => f.id === updatedFilter.id);
		if (index !== -1) {
			filterExpressions[index] = updatedFilter;
			updateFilteredLogs();
		}
	}

	function deleteFilterExpression(filterId: string) {
		filterExpressions = filterExpressions.filter((f) => f.id !== filterId);
		updateFilteredLogs();
	}

	onMount(() => {
		loadInputFromStorage();
		loadColumnsFromStorage();
		loadSortFromStorage();
		loadFiltersFromStorage();

		parseLogLines(logInput);
	});

	// $effect(() => {
	// 	parseLogLines(logInput);
	// });

	$effect(() => {
		columns;
		saveColumnsToStorage();
	});

	$effect(() => {
		logInput;
		saveInputToStorage();
	});

	$effect(() => {
		filterExpressions;
		saveFiltersToStorage();
	});
</script>

<div class="flex min-h-screen bg-gray-50">
	<!-- Main Content -->
	<div class="flex-1 transition-all duration-300 {sidebarOpen ? 'mr-96' : ''}">
		<div class="container mx-auto p-6">
			<h1 class="mb-6 text-3xl font-bold">Log Analyzer</h1>

			<!-- Input Section -->
			<div class="mb-6">
				<label for="log-input" class="mb-2 block text-sm font-medium"
					>Paste your logs here (one JSON object per line):</label
				>
				<textarea
					id="log-input"
					bind:value={logInput}
					oninput={() => parseLogLines(logInput)}
					placeholder="Paste JSON logs here, one per line..."
					class="h-32 w-full rounded-md border border-gray-300 p-3 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
				></textarea>
			</div>

			<!-- Column Management -->
			<div class="mb-6 rounded-lg bg-gray-50">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Manage Table Columns</h2>
				</div>
				<div class="mb-3 flex gap-2">
					<input
						type="text"
						bind:value={newFieldName}
						placeholder="Enter field name (e.g., nested.prop, array[0].field)"
						class="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-blue-500"
						onkeydown={(e) => e.key === 'Enter' && addColumn()}
					/>
					<button
						onclick={addColumn}
						class="rounded-md bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
					>
						Add Column
					</button>
				</div>

				<!-- Current Columns -->
				<div class="flex flex-wrap gap-2">
					{#each columns as column, index (column.id)}
						<div
							class="flex cursor-move items-center gap-2 rounded-lg border px-3 py-1 {column.hidden
								? 'bg-gray-200 opacity-60'
								: 'bg-white'}"
							role="button"
							tabindex="0"
							draggable="true"
							ondragstart={() => handleDragStart(index)}
							ondragover={handleDragOver}
							ondrop={(e) => handleDrop(e, index)}
						>
							<span class="text-sm {column.hidden ? 'text-gray-500 line-through' : ''}"
								>{column.name}</span
							>
							<div class="flex items-center gap-1">
								<button
									onclick={() => toggleColumnVisibility(index)}
									class="text-xs {column.hidden
										? 'text-gray-400 hover:text-gray-600'
										: 'text-blue-500 hover:text-blue-700'}"
									title={column.hidden ? 'Show column' : 'Hide column'}
								>
									{column.hidden ? '👁️' : '🙈'}
								</button>
								{#if column.field !== '__raw__'}
									<button
										onclick={() => removeColumn(index)}
										class="text-xs text-red-500 hover:text-red-700"
										title="Remove column"
									>
										✕
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Filter Section -->
			<div class="mb-6 rounded-lg border border-gray-200 bg-white p-4">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-lg font-semibold">Filter Logs</h2>
					<div class="flex items-center gap-2">
						<button
							onclick={() => addFilterExpression()}
							class="rounded-md bg-green-600 px-3 py-1 text-sm text-white transition-colors hover:bg-green-700"
						>
							+ Add Filter
						</button>
					</div>
				</div>

				{#if filterExpressions.length === 0}
					<div class="py-4 text-center text-gray-500">
						<p class="text-sm">No filters yet. Click "Add Filter" to start filtering your logs.</p>
						<p class="mt-1 text-xs">Multiple filters will be combined with AND logic.</p>
					</div>
				{:else}
					<div class="space-y-2">
						{#each filterExpressions as filter (filter.id)}
							<FilterExpression
								{filter}
								onUpdate={updateFilterExpression}
								onDelete={deleteFilterExpression}
							/>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Results Table -->
			{#if filteredLogs.length > 0}
				<div class="overflow-hidden rounded-lg border bg-white">
					<div class="overflow-x-auto">
						<table class="w-full">
							<thead class="bg-gray-50">
								<tr>
									{#each columns.filter((col) => !col.hidden) as column}
										<th
											class="px-4 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase"
										>
											<div class="flex items-center gap-2">
												<span
													class={sortState?.column === column.field
														? 'font-semibold text-blue-600'
														: ''}>{column.name}</span
												>
												{#if sortState?.column === column.field}
													<span class="text-xs text-blue-600">
														{sortState.direction === 'asc' ? '↑' : '↓'}
													</span>
												{/if}
												<div class="flex flex-col">
													<button
														onclick={() => sortColumn(column.field, 'asc')}
														class="text-xs transition-colors {sortState?.column === column.field &&
														sortState?.direction === 'asc'
															? 'text-blue-600'
															: 'text-gray-400 hover:text-gray-600'}"
													>
														▲
													</button>
													<button
														onclick={() => sortColumn(column.field, 'desc')}
														class="text-xs transition-colors {sortState?.column === column.field &&
														sortState?.direction === 'desc'
															? 'text-blue-600'
															: 'text-gray-400 hover:text-gray-600'}"
													>
														▼
													</button>
												</div>
											</div>
										</th>
										<th></th>
									{/each}
								</tr>
							</thead>
							<tbody class="divide-y divide-gray-200">
								{#each filteredLogs as log}
									<tr
										class="cursor-pointer transition-colors hover:bg-gray-50 {selectedLog === log
											? 'border-r-4 border-l-4 border-blue-500 bg-blue-50'
											: ''}"
										onclick={() => selectLog(log)}
										onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && selectLog(log)}
										role="button"
										tabindex="0"
										aria-label="View log details"
									>
										{#each columns.filter((col) => !col.hidden) as column}
											{@const cellValue = getNestedValue(log, column.field)}
											<td
												class="max-w-xs px-4 py-3 text-sm text-gray-900 {selectedLog === log
													? 'border-t-1 border-blue-500 '
													: ''}"
											>
												<div class="truncate" title={String(cellValue)}>
													{#if column.field === '__raw__'}
														<code class="rounded bg-gray-100 px-1 py-0.5 text-xs">
															{cellValue}
														</code>
													{:else if typeof cellValue === 'object' && cellValue !== null}
														<code class="rounded bg-blue-50 px-1 py-0.5 text-xs text-blue-800">
															{JSON.stringify(cellValue)}
														</code>
													{:else}
														{cellValue}
													{/if}
												</div>
											</td>
											<td>
												{#if column.field !== '__raw__' && cellValue !== ''}
													<button
														onclick={(evt) => {
															evt.stopPropagation();
															addFilterExpression({
																enabled: true,
																expression: `${column.field} = ${cellValue}`,
																id: Date.now().toString()
															});
															updateFilteredLogs();
														}}>⊕</button
													>
													<button
														onclick={(evt) => {
															evt.stopPropagation();
															addFilterExpression({
																enabled: true,
																expression: `${column.field} != ${cellValue}`,
																id: Date.now().toString()
															});
															updateFilteredLogs();
														}}>⊖</button
													>
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>

				<div class="mt-4 text-sm text-gray-600">
					Showing {filteredLogs.length} of {parsedLogs.length} log entries
					{#if filterExpressions.some((f) => f.enabled)}
						(filtered)
					{/if}
				</div>
			{:else if parsedLogs.length > 0}
				<div class="py-8 text-center text-gray-500">
					All log entries have been filtered out. Try adjusting your filter expressions.
				</div>
			{:else if logInput.trim()}
				<div class="py-8 text-center text-gray-500">
					No valid JSON objects found in the input. Make sure each line contains a valid JSON
					object.
				</div>
			{:else}
				<div class="py-8 text-center text-gray-500">
					Enter some log data above to see the parsed results here.
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Sidebar -->
{#if sidebarOpen && selectedLog}
	<div
		class="fixed top-0 right-0 z-10 h-full w-96 overflow-y-auto border-l border-gray-200 bg-white shadow-xl"
	>
		<!-- Sidebar Header -->
		<div
			class="sticky top-0 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4"
		>
			<h2 class="text-lg font-semibold text-gray-900">Log Details</h2>
			<button
				onclick={closeSidebar}
				class="cursor-pointer text-gray-400 transition-colors hover:text-gray-600"
			>
				✕
			</button>
		</div>

		<!-- Sidebar Content -->
		<div class="p-6">
			<div class="space-y-4">
				{#each columns as column}
					{@const value = getNestedValue(selectedLog, column.field)}
					<div class="border-b border-gray-100 pb-3">
						<div class="mb-1 flex items-center justify-between">
							<span class="text-sm font-medium text-gray-600">{column.name}</span>
							<button
								onclick={() => copyToClipboard(String(value))}
								class="rounded p-1 text-gray-400 transition-colors hover:text-gray-600"
								title="Copy to clipboard"
							>
								📋
							</button>
						</div>
						<div class="text-sm break-all text-gray-900">
							{#if column.field === '__raw__'}
								<pre
									class="overflow-x-auto rounded bg-gray-50 p-3 text-xs whitespace-pre-wrap">{JSON.stringify(
										JSON.parse(value),
										null,
										2
									)}</pre>
							{:else if typeof value === 'object' && value !== null}
								<code class="rounded bg-blue-50 px-2 py-1 text-blue-800"
									>{JSON.stringify(value)}</code
								>
							{:else if value === ''}
								<span class="text-gray-400 italic">empty</span>
							{:else}
								<span>{value}</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	</div>
{/if}
