import type { INodeProperties } from 'n8n-workflow';
import {
	UUID_REGEX,
	dateFilter,
	outputFormatOption,
	paginationFields,
	tableLocator,
	triggerAutomationsOption,
} from '../shared/descriptions';

const show = { resource: ['row'] };
const on = (...operation: string[]) => ({ resource: ['row'], operation });

/** The operators of the API filter (`column:operator:value`), with their names in n8n. */
export const ROW_OPERATORS = [
	{ name: 'Equals', value: 'eq' },
	{ name: 'Not Equals', value: 'ne' },
	{ name: 'Contains', value: 'contient' },
	{ name: 'Starts With', value: 'commence' },
	{ name: 'Greater Than', value: 'gt' },
	{ name: 'Greater Than or Equal', value: 'gte' },
	{ name: 'Less Than', value: 'lt' },
	{ name: 'Less Than or Equal', value: 'lte' },
	{ name: 'Is Empty', value: 'vide' },
	{ name: 'Is Not Empty', value: 'non_vide' },
];

export const rowDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show },
		options: [
			{ name: 'Create', value: 'create', action: 'Create row', description: 'Add a new row to a table' },
			{ name: 'Delete', value: 'delete', action: 'Delete row', description: 'Delete a row permanently' },
			{ name: 'Get', value: 'get', action: 'Get row', description: 'Retrieve a row from a table' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many rows', description: 'List the rows of a table' },
			{ name: 'Update', value: 'update', action: 'Update row', description: 'Update the fields of a row' },
		],
		default: 'create',
	},
	tableLocator(show),
	{
		displayName: 'Row ID',
		name: 'rowId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
		description: 'The ID of the row, as returned by "Get Many" or by the Kapacity Trigger',
		displayOptions: { show: on('get', 'update', 'delete') },
	},
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'resourceMapper',
		noDataExpression: true,
		default: { mappingMode: 'defineBelow', value: null },
		required: true,
		description: 'Fields left empty are not changed. Formula, rollup and lookup columns cannot be written, so they are not listed.',
		typeOptions: {
			loadOptionsDependsOn: ['table.value'],
			resourceMapper: {
				resourceMapperMethod: 'getRowFields',
				mode: 'add',
				fieldWords: { singular: 'column', plural: 'columns' },
				addAllFields: false,
				supportAutoMap: true,
			},
		},
		displayOptions: { show: on('create', 'update') },
	},
	...paginationFields(on('getAll')),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: on('getAll') },
		options: [
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				placeholder: 'e.g. Acme',
				default: '',
				description: 'Text searched in every text column of the table',
			},
			dateFilter('Updated Since', 'updatedSince', 'Only the rows changed at or after this date'),
			{
				displayName: 'Conditions',
				name: 'conditions',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Condition',
				default: {},
				description: 'All conditions must match (AND)',
				options: [
					{
						displayName: 'Condition',
						name: 'condition',
						values: [
							{
								displayName: 'Column Name or ID',
								name: 'column',
								type: 'options',
								typeOptions: { loadOptionsMethod: 'getTableColumns', loadOptionsDependsOn: ['table.value'] },
								default: '',
								description:
									'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
							},
							{
								displayName: 'Operator',
								name: 'operator',
								type: 'options',
								options: ROW_OPERATORS,
								default: 'eq',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								description:
									'For a choice column, the label of the option (e.g. "Signed"). For an amount, the value in euros.',
								displayOptions: { hide: { operator: ['vide', 'non_vide'] } },
							},
						],
					},
				],
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: on('create', 'update', 'get', 'getAll') },
		options: [
			outputFormatOption,
			{ ...triggerAutomationsOption, displayOptions: { show: { '/operation': ['create', 'update'] } } },
		],
	},
];

export const ROW_ID_REGEX = new RegExp(`^${UUID_REGEX}$`);
