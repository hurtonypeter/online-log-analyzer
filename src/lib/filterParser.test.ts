import { describe, it, expect } from 'vitest';
import { FilterParser } from './filterParser.js';

describe('FilterParser OR functionality', () => {
	const testLogs = [
		{ foo: 'bar', level: 'info', message: 'test1' },
		{ foo: 'baz', level: 'error', message: 'test2' },
		{ foo: 'qux', level: 'warn', message: 'test3' },
		{ foo: 'quux', level: 'debug', message: 'contains error' }
	];

	it('should parse simple OR expressions correctly', () => {
		const filter = FilterParser.parse("foo = 'bar' or foo = 'baz'");
		
		expect(filter).toBeDefined();
		expect(filter?.field).toBe('foo');
		expect(filter?.operator).toBe('=');
		expect(filter?.value).toBe('bar');
		expect(filter?.orConditions).toBeDefined();
		expect(filter?.orConditions?.length).toBe(1);
		expect(filter?.orConditions?.[0].field).toBe('foo');
		expect(filter?.orConditions?.[0].operator).toBe('=');
		expect(filter?.orConditions?.[0].value).toBe('baz');
	});

	it('should evaluate simple OR expressions correctly', () => {
		const filter = FilterParser.parse("foo = 'bar' or foo = 'baz'");
		
		expect(filter).toBeDefined();
		if (filter) {
			const matches = testLogs.filter(log => FilterParser.evaluate(log, filter));
			expect(matches.length).toBe(2);
			expect(matches.some(log => log.foo === 'bar')).toBe(true);
			expect(matches.some(log => log.foo === 'baz')).toBe(true);
		}
	});

	it('should handle mixed operators in OR expressions', () => {
		const filter = FilterParser.parse("level = 'error' or message contains('error')");
		
		expect(filter).toBeDefined();
		if (filter) {
			const matches = testLogs.filter(log => FilterParser.evaluate(log, filter));
			expect(matches.length).toBe(2);
			// Should match: error level entry and entry with 'error' in message
			expect(matches.some(log => log.level === 'error')).toBe(true);
			expect(matches.some(log => log.message.includes('error'))).toBe(true);
		}
	});

	it('should handle three OR conditions', () => {
		const filter = FilterParser.parse("foo = 'bar' or foo = 'baz' or level = 'warn'");
		
		expect(filter).toBeDefined();
		if (filter) {
			const matches = testLogs.filter(log => FilterParser.evaluate(log, filter));
			expect(matches.length).toBe(3);
			// Should match all except quux with debug level
			expect(matches.every(log => !(log.foo === 'quux' && log.level === 'debug'))).toBe(true);
		}
	});

	it('should handle OR with quotes containing "or" text', () => {
		const testData = [
			{ message: 'has or in text', foo: 'test' },
			{ message: 'normal', foo: 'bar' },
			{ message: 'another', foo: 'other' }
		];
		
		const filter = FilterParser.parse("message = 'has or in text' or foo = 'bar'");
		
		expect(filter).toBeDefined();
		if (filter) {
			const matches = testData.filter(log => FilterParser.evaluate(log, filter));
			expect(matches.length).toBe(2);
			expect(matches.some(log => log.message === 'has or in text')).toBe(true);
			expect(matches.some(log => log.foo === 'bar')).toBe(true);
		}
	});

	it('should still work with single conditions (no OR)', () => {
		const filter = FilterParser.parse("foo = 'bar'");
		
		expect(filter).toBeDefined();
		expect(filter?.field).toBe('foo');
		expect(filter?.operator).toBe('=');
		expect(filter?.value).toBe('bar');
		expect(filter?.orConditions).toBeUndefined();
		
		if (filter) {
			const matches = testLogs.filter(log => FilterParser.evaluate(log, filter));
			expect(matches.length).toBe(1);
			expect(matches[0].foo).toBe('bar');
		}
	});

	it('should handle function-style operators with OR', () => {
		const filter = FilterParser.parse("message contains('test') or level = 'error'");
		
		expect(filter).toBeDefined();
		if (filter) {
			const matches = testLogs.filter(log => FilterParser.evaluate(log, filter));
			expect(matches.length).toBe(3); // Matches logs with 'test' in message or error level
			expect(matches.every(log => 
				log.message.includes('test') || log.level === 'error'
			)).toBe(true);
		}
	});
});