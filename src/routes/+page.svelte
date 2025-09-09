<script lang="ts">

	let logInput = $state('');
	let parsedLogs = $state<any[]>([]);
	let columns = $state([{ id: 'line', name: 'Raw Line', field: '__raw__' }]);
	let newFieldName = $state('');
	let draggedColumn: number | null = null;

	function parseLogLines(input: string) {
		const lines = input.split('\n').filter(line => line.trim());
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
	}

	function addColumn() {
		if (newFieldName.trim()) {
			const id = Date.now().toString();
			columns = [...columns, { id, name: newFieldName.trim(), field: newFieldName.trim() }];
			newFieldName = '';
		}
	}

	function removeColumn(index: number) {
		if (columns[index].field !== '__raw__') {
			columns = columns.filter((_, i) => i !== index);
		}
	}

	function sortColumn(columnField: string, ascending = true) {
		parsedLogs = [...parsedLogs].sort((a, b) => {
			const aVal = a[columnField] ?? '';
			const bVal = b[columnField] ?? '';
			
			if (typeof aVal === 'string' && typeof bVal === 'string') {
				return ascending ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
			}
			
			return ascending ? (aVal > bVal ? 1 : -1) : (bVal > aVal ? 1 : -1);
		});
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

	$effect(() => {
		parseLogLines(logInput);
	});
</script>

<div class="container mx-auto p-6">
	<h1 class="text-3xl font-bold mb-6">Log Analyzer</h1>
	
	<!-- Input Section -->
	<div class="mb-6">
		<label for="log-input" class="block text-sm font-medium mb-2">Paste your logs here (one JSON object per line):</label>
		<textarea
			id="log-input"
			bind:value={logInput}
			placeholder="Paste JSON logs here, one per line..."
			class="w-full h-32 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
		></textarea>
	</div>

	<!-- Column Management -->
	<div class="mb-6 bg-gray-50 p-4 rounded-lg">
		<h2 class="text-lg font-semibold mb-3">Manage Table Columns</h2>
		<div class="flex gap-2 mb-3">
			<input
				type="text"
				bind:value={newFieldName}
				placeholder="Enter field name to add as column"
				class="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
				onkeydown={(e) => e.key === 'Enter' && addColumn()}
			/>
			<button
				onclick={addColumn}
				class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
			>
				Add Column
			</button>
		</div>
		
		<!-- Current Columns -->
		<div class="flex flex-wrap gap-2">
			{#each columns as column, index (column.id)}
				<div
					class="flex items-center gap-2 px-3 py-1 bg-white border rounded-lg cursor-move"
					role="button"
					tabindex="0"
					draggable="true"
					ondragstart={() => handleDragStart(index)}
					ondragover={handleDragOver}
					ondrop={(e) => handleDrop(e, index)}
				>
					<span class="text-sm">{column.name}</span>
					{#if column.field !== '__raw__'}
						<button
							onclick={() => removeColumn(index)}
							class="text-red-500 hover:text-red-700 text-xs"
						>
							✕
						</button>
					{/if}
				</div>
			{/each}
		</div>
	</div>

	<!-- Results Table -->
	{#if parsedLogs.length > 0}
		<div class="bg-white rounded-lg border overflow-hidden">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-gray-50">
						<tr>
							{#each columns as column}
								<th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									<div class="flex items-center gap-2">
										<span>{column.name}</span>
										<div class="flex flex-col">
											<button
												onclick={() => sortColumn(column.field, true)}
												class="text-gray-400 hover:text-gray-600 text-xs"
											>
												▲
											</button>
											<button
												onclick={() => sortColumn(column.field, false)}
												class="text-gray-400 hover:text-gray-600 text-xs"
											>
												▼
											</button>
										</div>
									</div>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody class="divide-y divide-gray-200">
						{#each parsedLogs as log}
							<tr class="hover:bg-gray-50">
								{#each columns as column}
									<td class="px-4 py-3 text-sm text-gray-900 max-w-xs">
										<div class="truncate" title={String(log[column.field] ?? '')}>
											{#if column.field === '__raw__'}
												<code class="text-xs bg-gray-100 px-1 py-0.5 rounded">{log[column.field]}</code>
											{:else}
												{log[column.field] ?? ''}
											{/if}
										</div>
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
		
		<div class="mt-4 text-sm text-gray-600">
			Showing {parsedLogs.length} parsed log entries
		</div>
	{:else if logInput.trim()}
		<div class="text-gray-500 text-center py-8">
			No valid JSON objects found in the input. Make sure each line contains a valid JSON object.
		</div>
	{:else}
		<div class="text-gray-500 text-center py-8">
			Enter some log data above to see the parsed results here.
		</div>
	{/if}
</div>
