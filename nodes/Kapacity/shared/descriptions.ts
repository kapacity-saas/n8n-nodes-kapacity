import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';

/** A UUID, as Kapacity uses for every record, contract, template or form. */
export const UUID_REGEX = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

const idMode = (placeholder: string) => ({
	displayName: 'By ID',
	name: 'id',
	type: 'string' as const,
	placeholder,
	validation: [
		{
			type: 'regex' as const,
			properties: { regex: `^${UUID_REGEX}$`, errorMessage: 'Not a valid Kapacity ID' },
		},
	],
});

export function contactBaseSelect(show: IDisplayOptions['show']): INodeProperties {
	return {
		displayName: 'Base',
		name: 'base',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Mon Pipe', value: 'leads', description: 'The closing pipeline' },
			{ name: 'Setting', value: 'leads_setting', description: 'The setting pipeline' },
		],
		default: 'leads',
		description: 'The Kapacity base the contact belongs to',
		displayOptions: { show },
	};
}

export function contactLocator(show: IDisplayOptions['show'], name = 'contactId'): INodeProperties {
	return {
		displayName: 'Contact',
		name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'The contact, searched by name, e-mail, company or phone',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a contact...',
				typeOptions: { searchListMethod: name === 'contactId' ? 'searchContacts' : 'searchAllContacts', searchable: true },
			},
			idMode('e.g. 7fc74cfb-c67a-43d2-868f-f4a8ab028475'),
		],
		displayOptions: { show },
	};
}

export function tableLocator(show: IDisplayOptions['show']): INodeProperties {
	return {
		displayName: 'Table',
		name: 'table',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: 'A table created in the CRM (Mes Ventes, Ressources, your own tables). Contacts have their own resource.',
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a table...',
				typeOptions: { searchListMethod: 'searchTables', searchable: true },
			},
			idMode('e.g. 6b0c9e2a-1f3d-4c5b-9a8e-7d6c5b4a3f2e'),
		],
		displayOptions: { show },
	};
}

export function simpleLocator(
	show: IDisplayOptions['show'],
	opts: { displayName: string; name: string; method: string; placeholder: string; description: string },
): INodeProperties {
	return {
		displayName: opts.displayName,
		name: opts.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		description: opts.description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: opts.placeholder,
				typeOptions: { searchListMethod: opts.method, searchable: true },
			},
			idMode('e.g. 3e5a7c9b-2d4f-4e6a-8b1c-9d0e2f4a6b8c'),
		],
		displayOptions: { show },
	};
}

/** "Return All" and "Limit", the pair every "Get Many" operation carries. */
export function paginationFields(show: IDisplayOptions['show']): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, returnAll: [false] } },
		},
	];
}

/** How a contact or a row comes out of the node. */
export const outputFormatOption: INodeProperties = {
	displayName: 'Output Format',
	name: 'outputFormat',
	type: 'options',
	options: [
		{
			name: 'Readable',
			value: 'readable',
			description: 'Column names instead of IDs, option labels, member names and amounts in euros',
		},
		{
			name: 'Raw',
			value: 'raw',
			description: 'The API response as is: values keyed by column ID, amounts in cents',
		},
	],
	default: 'readable',
};

export const triggerAutomationsOption: INodeProperties = {
	displayName: 'Trigger Automations',
	name: 'triggerAutomations',
	type: 'boolean',
	default: true,
	description:
		'Whether this write starts the Kapacity automations, as a change made on screen would. Turn off when importing data, or when copying data that already comes from Kapacity.',
};

export const dateFilter = (displayName: string, name: string, description: string): INodeProperties => ({
	displayName,
	name,
	type: 'dateTime',
	default: '',
	description,
});
