export interface FilterExpression {
	id: string;
	expression: string;
	enabled: boolean;
}

export interface ParsedFilter {
	field: string;
	operator: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any;
	// For OR operations, this can be an array of conditions
	orConditions?: ParsedFilter[];
}

export type FilterOperator =
	| '='
	| '!='
	| '>'
	| '<'
	| '>='
	| '<='
	| 'contains'
	| 'startswith'
	| 'endswith'
	| 'exists';

export class FilterParser {
	private static readonly OPERATORS: FilterOperator[] = [
		'contains',
		'startswith',
		'endswith',
		'exists', // Function-style operators first (longer matches)
		'!=',
		'>=',
		'<=',
		'=',
		'>',
		'<' // Comparison operators
	];

	static parse(expression: string): ParsedFilter | null {
		if (!expression.trim()) return null;

		// Check if expression contains OR operations
		const orParts = this.splitByOr(expression);
		if (orParts.length > 1) {
			// Parse each OR condition
			const conditions: ParsedFilter[] = [];
			for (const part of orParts) {
				const condition = this.parseSingleCondition(part.trim());
				if (condition) {
					conditions.push(condition);
				}
			}
			
			if (conditions.length > 0) {
				// Return the first condition with OR conditions attached
				const mainCondition = conditions[0];
				if (conditions.length > 1) {
					mainCondition.orConditions = conditions.slice(1);
				}
				return mainCondition;
			}
		}

		// Single condition - parse normally
		return this.parseSingleCondition(expression);
	}

	private static splitByOr(expression: string): string[] {
		// Split by 'or' but be careful about quotes
		const parts: string[] = [];
		let current = '';
		let inQuotes = false;
		let quoteChar = '';
		
		for (let i = 0; i < expression.length; i++) {
			const char = expression[i];
			
			if ((char === '"' || char === "'") && !inQuotes) {
				inQuotes = true;
				quoteChar = char;
				current += char;
			} else if (char === quoteChar && inQuotes) {
				inQuotes = false;
				quoteChar = '';
				current += char;
			} else if (!inQuotes && expression.slice(i, i + 2).toLowerCase() === 'or' && 
				(i === 0 || /\s/.test(expression[i - 1])) &&
				(i + 2 >= expression.length || /\s/.test(expression[i + 2]))) {
				// Found 'or' outside quotes, surrounded by whitespace or at boundaries
				parts.push(current.trim());
				current = '';
				i += 1; // Skip the 'r' in 'or'
			} else {
				current += char;
			}
		}
		
		if (current.trim()) {
			parts.push(current.trim());
		}
		
		return parts.filter(part => part.length > 0);
	}

	private static parseSingleCondition(expression: string): ParsedFilter | null {
		if (!expression.trim()) return null;

		// Handle function-style operators like contains('value'), startswith('value'), endswith('value')
		const functionMatch = expression.match(
			/^([a-zA-Z_$][a-zA-Z0-9_$.[\]]*)\s*(contains|startswith|endswith)\s*\(\s*['"]([^'"]*)['"]\s*\)$/
		);

		if (functionMatch) {
			const [, field, operator, value] = functionMatch;
			return {
				field: field.trim(),
				operator: operator as FilterOperator,
				value: value
			};
		}

		// Handle comparison operators
		for (const op of this.OPERATORS) {
			if (op.includes('(')) continue; // Skip function-style operators

			const parts = expression.split(op);
			if (parts.length === 2) {
				const field = parts[0].trim();
				const rawValue = parts[1].trim();

				// Remove quotes from value if present
				const value = this.parseValue(rawValue);

				return {
					field,
					operator: op,
					value
				};
			}
		}

		return null;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private static parseValue(rawValue: string): any {
		// Remove surrounding quotes
		if (
			(rawValue.startsWith('"') && rawValue.endsWith('"')) ||
			(rawValue.startsWith("'") && rawValue.endsWith("'"))
		) {
			return rawValue.slice(1, -1);
		}

		// Try to parse as number
		if (!isNaN(Number(rawValue)) && rawValue.trim() !== '') {
			return Number(rawValue);
		}

		// Try to parse as boolean
		if (rawValue.toLowerCase() === 'true') return true;
		if (rawValue.toLowerCase() === 'false') return false;

		// Return as string
		return rawValue;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static evaluate(logEntry: any, filter: ParsedFilter): boolean {
		// Evaluate the main condition
		const mainResult = this.evaluateSingleCondition(logEntry, filter);
		
		// If there are OR conditions, evaluate them
		if (filter.orConditions && filter.orConditions.length > 0) {
			// Return true if main condition OR any of the OR conditions is true
			return mainResult || filter.orConditions.some(orCondition => 
				this.evaluateSingleCondition(logEntry, orCondition)
			);
		}
		
		return mainResult;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private static evaluateSingleCondition(logEntry: any, filter: ParsedFilter): boolean {
		const fieldValue = this.getNestedValue(logEntry, filter.field);

		switch (filter.operator) {
			case '=':
				return this.compareValues(fieldValue, filter.value) === 0;
			case '!=':
				return this.compareValues(fieldValue, filter.value) !== 0;
			case '>':
				return this.compareValues(fieldValue, filter.value) > 0;
			case '<':
				return this.compareValues(fieldValue, filter.value) < 0;
			case '>=':
				return this.compareValues(fieldValue, filter.value) >= 0;
			case '<=':
				return this.compareValues(fieldValue, filter.value) <= 0;
			case 'contains':
				return String(fieldValue).toLowerCase().includes(String(filter.value).toLowerCase());
			case 'startswith':
				return String(fieldValue).toLowerCase().startsWith(String(filter.value).toLowerCase());
			case 'endswith':
				return String(fieldValue).toLowerCase().endsWith(String(filter.value).toLowerCase());
			case 'exists':
				return !!fieldValue;
			default:
				return false;
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private static compareValues(a: any, b: any): number {
		// Handle null/undefined
		if (a == null && b == null) return 0;
		if (a == null) return -1;
		if (b == null) return 1;

		// If both are numbers, compare numerically
		if (typeof a === 'number' && typeof b === 'number') {
			return a - b;
		}

		// If both are strings, compare lexically
		if (typeof a === 'string' && typeof b === 'string') {
			return a.localeCompare(b);
		}

		// Convert to strings for comparison
		return String(a).localeCompare(String(b));
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	private static getNestedValue(obj: any, path: string): any {
		if (path === '__raw__') return obj.__raw__;

		const parts = path.split('.');
		let current = obj;

		for (const part of parts) {
			if (current == null) return null;

			// Check if this part has array indexing
			const arrayMatch = part.match(/^(.+?)\[(\d+)\]$/);
			if (arrayMatch) {
				const [, arrayName, index] = arrayMatch;
				current = current[arrayName];
				if (Array.isArray(current) && parseInt(index) < current.length) {
					current = current[parseInt(index)];
				} else {
					return null;
				}
			} else {
				current = current[part];
			}
		}

		return current;
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static applyFilters(logs: any[], filterExpressions: FilterExpression[]): any[] {
		const enabledFilters = filterExpressions.filter((f) => f.enabled && f.expression.trim() !== '');

		if (enabledFilters.length === 0) {
			return logs;
		}

		return logs.filter((log) => {
			// All filters must pass (AND logic)
			return enabledFilters.every((filterExpr) => {
				const parsedFilter = this.parse(filterExpr.expression);
				if (!parsedFilter) return true; // Invalid filters are ignored

				return this.evaluate(log, parsedFilter);
			});
		});
	}
}
