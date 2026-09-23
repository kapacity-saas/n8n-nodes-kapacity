import type { INodeProperties } from 'n8n-workflow';
import { dateFilter, paginationFields, simpleLocator, tableLocator } from '../shared/descriptions';

/** One operation selector, for the resources that are only read. */
function operations(
	resource: string,
	options: Array<{ name: string; value: string; action: string; description: string }>,
	defaultValue = 'getAll',
): INodeProperties {
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options,
		default: defaultValue,
	};
}

const getAll = (plural: string, description: string) => ({
	name: 'Get Many',
	value: 'getAll',
	action: `Get many ${plural}`,
	description,
});

// ---- Table -------------------------------------------------------------------------------------------------

export const tableDescription: INodeProperties[] = [
	operations('table', [
		{ name: 'Get Columns', value: 'getColumns', action: 'Get columns of table', description: 'List the columns of a table, with their type and choices' },
		getAll('tables', 'Retrieve the tables of the CRM, contact bases included'),
	], 'getColumns'),
	tableLocator({ resource: ['table'], operation: ['getColumns'] }),
];

// ---- Contract template -------------------------------------------------------------------------------------

export const contractTemplateDescription: INodeProperties[] = [
	operations('contractTemplate', [
		getAll('contract templates', 'Retrieve the contract templates, and whether each one can be sent now'),
	]),
];

// ---- Appointment -------------------------------------------------------------------------------------------

export const appointmentDescription: INodeProperties[] = [
	operations('appointment', [getAll('appointments', 'Retrieve a list of appointments booked in Kapacity')]),
	...paginationFields({ resource: ['appointment'], operation: ['getAll'] }),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['appointment'], operation: ['getAll'] } },
		options: [
			{ displayName: 'Contact ID', name: 'contact', type: 'string', default: '', description: 'Only the appointments of this contact' },
			dateFilter('Starts After', 'since', 'Only the appointments starting at or after this date'),
			dateFilter('Starts Before', 'until', 'Only the appointments starting before this date'),
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Canceled', value: 'annule' },
					{ name: 'Completed', value: 'termine' },
					{ name: 'Confirmed', value: 'confirme' },
				],
				default: 'confirme',
			},
		],
	},
];

export const appointmentTypeDescription: INodeProperties[] = [
	operations('appointmentType', [
		getAll('appointment types', 'Retrieve the appointment types, with their public booking link'),
	]),
];

// ---- Form --------------------------------------------------------------------------------------------------

export const formDescription: INodeProperties[] = [
	operations('form', [getAll('forms', 'Retrieve the forms of the workspace, with their public link')]),
];

export const formResponseDescription: INodeProperties[] = [
	operations('formResponse', [getAll('form responses', 'Retrieve the responses to a form, with their score')]),
	simpleLocator({ resource: ['formResponse'], operation: ['getAll'] }, {
		displayName: 'Form',
		name: 'formId',
		method: 'searchForms',
		placeholder: 'Select a form...',
		description: 'The form whose responses to retrieve',
	}),
	...paginationFields({ resource: ['formResponse'], operation: ['getAll'] }),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['formResponse'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Qualified',
				name: 'qualified',
				type: 'boolean',
				default: true,
				description: 'Whether to keep only the qualified responses (on) or only the others (off)',
			},
			dateFilter('Submitted Since', 'since', 'Only the responses submitted at or after this date'),
		],
	},
];

// ---- Sales -------------------------------------------------------------------------------------------------

export const productDescription: INodeProperties[] = [
	operations('product', [getAll('products', 'Retrieve the product catalogue, with prices')]),
];

export const paymentDescription: INodeProperties[] = [
	operations('payment', [getAll('payments', 'Retrieve the payments received')]),
	...paginationFields({ resource: ['payment'], operation: ['getAll'] }),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['payment'], operation: ['getAll'] } },
		options: [
			{ displayName: 'Contact ID', name: 'contact', type: 'string', default: '', description: 'Only the payments of this contact' },
			dateFilter('Received After', 'since', 'Only the payments received at or after this date'),
			dateFilter('Received Before', 'until', 'Only the payments received before this date'),
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Failed', value: 'failed' },
					{ name: 'Succeeded', value: 'succeeded' },
				],
				default: 'succeeded',
			},
		],
	},
];

// ---- Team and workspace ------------------------------------------------------------------------------------

export const memberDescription: INodeProperties[] = [
	operations('member', [getAll('members', 'Retrieve the members of the workspace, with their roles and teams')]),
];

export const workspaceDescription: INodeProperties[] = [
	operations('workspace', [
		{ name: 'Get', value: 'get', action: 'Get workspace', description: 'Retrieve the workspace, its plan and the remaining API quota' },
	], 'get'),
];
