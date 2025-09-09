<script lang="ts">
	import type { FilterExpression } from './filterParser.js';

	interface Props {
		filter: FilterExpression;
		onUpdate: (filter: FilterExpression) => void;
		onDelete: (filterId: string) => void;
	}

	let { filter, onUpdate, onDelete }: Props = $props();

	let isExpanded = $state(false);

	function updateExpression(value: string) {
		onUpdate({ ...filter, expression: value });
	}

	function toggleEnabled() {
		onUpdate({ ...filter, enabled: !filter.enabled });
	}

	function deleteFilter() {
		onDelete(filter.id);
	}

	function toggleExpanded() {
		isExpanded = !isExpanded;
	}
</script>

<div
	class="rounded-lg border {filter.enabled
		? 'border-gray-300 bg-white'
		: 'border-gray-200 bg-gray-50'}"
>
	<div class="flex items-center gap-2 p-3">
		<!-- Enable/Disable Toggle -->
		<button
			onclick={toggleEnabled}
			class="flex h-6 w-6 items-center justify-center rounded border-2 transition-colors {filter.enabled
				? 'border-green-500 bg-green-500 text-white'
				: 'border-gray-300 bg-gray-200 text-gray-500'}"
			title={filter.enabled ? 'Click to disable filter' : 'Click to enable filter'}
		>
			{filter.enabled ? '✓' : '○'}
		</button>

		<!-- Filter Expression Input -->
		<input
			type="text"
			value={filter.expression}
			oninput={(e) => updateExpression(e.currentTarget.value)}
			placeholder="e.g., foo.bar='value', level>3, message contains('error')"
			class="flex-1 rounded border border-gray-300 px-3 py-1 focus:border-transparent focus:ring-2 focus:ring-blue-500 {filter.enabled
				? ''
				: 'bg-gray-100 text-gray-600'}"
		/>

		<!-- Action Buttons -->
		<div class="flex items-center gap-1">
			<button
				onclick={toggleExpanded}
				class="p-1 text-gray-500 transition-colors hover:text-gray-700"
				title="Toggle help"
			>
				{isExpanded ? '▼' : '▶'}
			</button>
			<button
				onclick={deleteFilter}
				class="p-1 text-red-500 transition-colors hover:text-red-700"
				title="Delete filter"
			>
				✕
			</button>
		</div>
	</div>

	<!-- Help/Documentation Panel -->
	{#if isExpanded}
		<div class="border-t border-gray-200 bg-gray-50 p-3 text-sm">
			<div class="space-y-2">
				<div>
					<strong>Supported operators:</strong>
				</div>
				<ul class="ml-4 space-y-1 text-xs">
					<li><code>field = 'value'</code> - Exact match</li>
					<li><code>field != 'value'</code> - Not equal</li>
					<li><code>field &gt; 123</code> - Greater than (numbers)</li>
					<li><code>field &gt;= 123</code> - Greater than or equal</li>
					<li><code>field &lt; 123</code> - Less than</li>
					<li><code>field &lt;= 123</code> - Less than or equal</li>
					<li><code>field contains('text')</code> - Contains substring</li>
					<li><code>field startswith('text')</code> - Starts with</li>
					<li><code>field endswith('text')</code> - Ends with</li>
				</ul>
				<div class="mt-3">
					<strong>Examples:</strong>
				</div>
				<ul class="ml-4 space-y-1 text-xs">
					<li><code>foo.bar = 'something'</code> - Nested property</li>
					<li><code>array[0].prop &gt; 10</code> - Array element</li>
					<li><code>level = 'error'</code> - Simple field</li>
					<li><code>message contains('failed')</code> - Text search</li>
				</ul>
			</div>
		</div>
	{/if}
</div>
