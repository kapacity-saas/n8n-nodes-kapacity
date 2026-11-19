import type { INodeProperties } from 'n8n-workflow';
import { contactLocator, dateFilter, paginationFields, simpleLocator, triggerAutomationsOption } from '../shared/descriptions';

const show = { resource: ['contract'] };
const on = (...operation: string[]) => ({ resource: ['contract'], operation });

export const CONTRACT_STATUSES = [
	{ name: 'Draft', value: 'brouillon' },
	{ name: 'Sent', value: 'envoye' },
	{ name: 'Viewed', value: 'vu' },
	{ name: 'In Signing', value: 'en_cours', description: 'At least one signer has signed, not all of them yet' },
	{ name: 'Signed', value: 'signe' },
];

export const contractDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show },
		options: [
			{ name: 'Get', value: 'get', action: 'Get contract', description: 'Retrieve a contract and its audit trail' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many contracts', description: 'Retrieve a list of contracts' },
			{
				name: 'Send',
				value: 'send',
				action: 'Send contract',
				description: 'Create a contract from a template and send it to a contact for e-signature',
			},
		],
		default: 'send',
	},
	simpleLocator(on('send'), {
		displayName: 'Contract Template',
		name: 'templateId',
		method: 'searchContractTemplates',
		placeholder: 'Select a template...',
		description: 'The contract template to fill in and send',
	}),
	contactLocator(on('send'), 'signerId'),
	{
		displayName: 'Amount (€)',
		name: 'amount',
		type: 'number',
		typeOptions: { minValue: 0, numberPrecision: 2 },
		default: 0,
		required: true,
		description: 'The contract amount, written in the contract in place of {{montant}}',
		displayOptions: { show: on('send') },
	},
	{
		displayName: 'Signers',
		name: 'signers',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Signer',
		default: {},
		description:
			'Other people who sign the contract with the contact (7 at most). The contact always signs, as the Client. A role of the template that you do not give here is removed from this contract. Each signer gets their own signing link, by e-mail if they have an address.',
		displayOptions: { show: on('send') },
		options: [
			{
				displayName: 'Signer',
				name: 'signer',
				values: [
					{
						displayName: 'Role Name or ID',
						name: 'role',
						type: 'options',
						typeOptions: { loadOptionsMethod: 'getContractTemplateRoles', loadOptionsDependsOn: ['templateId.value'] },
						default: '',
						description:
							'The role of the template this person signs as. Roles whose signature is already placed in the template are not listed. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'e.g. Marc Martin',
						description: 'The full name of the person who signs',
					},
					{
						displayName: 'E-Mail',
						name: 'email',
						type: 'string',
						default: '',
						placeholder: 'e.g. marc@example.com',
						description:
							'Where Kapacity e-mails their signing link (not when Send E-Mail is off). Leave empty to send the link yourself: it is in the output, under signataires.',
					},
				],
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: on('send') },
		options: [
			{
				displayName: 'E-Mail Template ID',
				name: 'emailTemplateId',
				type: 'string',
				default: '',
				placeholder: 'e.g. 8a6c4e2f-0b9d-4f7b-a5c3-1e9f7d5b3a1c',
				description: 'Another contract e-mail template than the one attached to the contract template',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: 'e.g. deal-4821',
				description:
					'A unique text per contract (for example the ID of the deal). If the workflow runs twice with the same key, Kapacity returns the first contract instead of sending a second one.',
			},
			{
				displayName: 'Send E-Mail',
				name: 'sendEmail',
				type: 'boolean',
				default: true,
				description:
					'Whether Kapacity e-mails the contract to the contact. Turn off to send the signing link yourself (WhatsApp, SMS…): it is always in the output.',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				placeholder: 'e.g. Coaching programme · Nathan Smith',
				description: 'Defaults to "&lt;template&gt; · &lt;contact name&gt;"',
			},
			triggerAutomationsOption,
		],
	},
	simpleLocator(on('get'), {
		displayName: 'Contract',
		name: 'contractId',
		method: 'searchContracts',
		placeholder: 'Select a contract...',
		description: 'The contract to retrieve',
	}),
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
				displayName: 'Contact ID',
				name: 'contact',
				type: 'string',
				default: '',
				description: 'Only the contracts of this contact',
			},
			dateFilter('Created Since', 'since', 'Only the contracts created at or after this date'),
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: CONTRACT_STATUSES,
				default: 'signe',
			},
		],
	},
];
