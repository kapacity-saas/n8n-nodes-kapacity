import type { INodeProperties } from 'n8n-workflow';
import {
	contactBaseSelect,
	contactLocator,
	dateFilter,
	outputFormatOption,
	paginationFields,
	triggerAutomationsOption,
} from '../shared/descriptions';

const show = { resource: ['contact'] };
const on = (...operation: string[]) => ({ resource: ['contact'], operation });

export const contactDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show },
		options: [
			{ name: 'Create', value: 'create', action: 'Create contact', description: 'Create a new contact' },
			{
				name: 'Create or Update',
				value: 'upsert',
				action: 'Create or update contact',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
			},
			{ name: 'Delete', value: 'delete', action: 'Delete contact', description: 'Delete a contact permanently' },
			{ name: 'Get', value: 'get', action: 'Get contact', description: 'Retrieve a contact' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many contacts', description: 'Retrieve a list of contacts' },
			{ name: 'Update', value: 'update', action: 'Update contact', description: 'Update the fields of a contact' },
		],
		default: 'create',
	},
	contactBaseSelect(show),
	contactLocator(on('get', 'update', 'delete')),
	{
		displayName: 'E-Mail',
		name: 'email',
		type: 'string',
		placeholder: 'e.g. nathan@example.com',
		default: '',
		required: true,
		description: 'The e-mail that identifies the contact: if a contact of this base has it, it is updated, otherwise one is created',
		displayOptions: { show: on('upsert') },
	},
	{
		displayName: 'Fields',
		name: 'fields',
		type: 'resourceMapper',
		noDataExpression: true,
		default: { mappingMode: 'defineBelow', value: null },
		required: true,
		description: 'A new contact needs at least a first name, a last name, an email or a phone. Fields left empty are not changed.',
		typeOptions: {
			loadOptionsDependsOn: ['base'],
			resourceMapper: {
				resourceMapperMethod: 'getContactFields',
				mode: 'add',
				fieldWords: { singular: 'field', plural: 'fields' },
				addAllFields: false,
				multiKeyMatch: false,
				supportAutoMap: true,
			},
		},
		displayOptions: { show: on('create', 'update', 'upsert') },
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
				displayName: 'E-Mail',
				name: 'email',
				type: 'string',
				placeholder: 'e.g. nathan@example.com',
				default: '',
				description: 'Only the contact that has exactly this e-mail',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				placeholder: 'e.g. Smith',
				default: '',
				description: 'Text searched in the name, e-mail, company, phone and text fields',
			},
			{
				displayName: 'Status Name or ID',
				name: 'status',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getContactStatuses', loadOptionsDependsOn: ['base'] },
				default: '',
				description:
					'Only the contacts in this commercial status. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			dateFilter('Updated Since', 'updatedSince', 'Only the contacts changed at or after this date'),
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: on('create', 'update', 'upsert', 'get', 'getAll') },
		options: [
			outputFormatOption,
			{ ...triggerAutomationsOption, displayOptions: { show: { '/operation': ['create', 'update', 'upsert'] } } },
		],
	},
];
