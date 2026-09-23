import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { ExecutionCache, runOperation } from './actions';
import { listSearch, loadOptions, resourceMapping } from './methods';
import { contactDescription } from './resources/contact';
import { contractDescription } from './resources/contract';
import {
	appointmentDescription,
	appointmentTypeDescription,
	contractTemplateDescription,
	formDescription,
	formResponseDescription,
	memberDescription,
	paymentDescription,
	productDescription,
	tableDescription,
	workspaceDescription,
} from './resources/reading';
import { rowDescription } from './resources/row';

export class Kapacity implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Kapacity',
		name: 'kapacity',
		icon: { light: 'file:../../icons/kapacity.svg', dark: 'file:../../icons/kapacity.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Work with the contacts, tables, contracts, appointments and payments of Kapacity',
		defaults: { name: 'Kapacity' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'kapacityApi', required: true }],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Appointment', value: 'appointment' },
					{ name: 'Appointment Type', value: 'appointmentType' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Contract', value: 'contract' },
					{ name: 'Contract Template', value: 'contractTemplate' },
					{ name: 'Form', value: 'form' },
					{ name: 'Form Response', value: 'formResponse' },
					{ name: 'Member', value: 'member' },
					{ name: 'Payment', value: 'payment' },
					{ name: 'Product', value: 'product' },
					{ name: 'Row', value: 'row' },
					{ name: 'Table', value: 'table' },
					{ name: 'Workspace', value: 'workspace' },
				],
				default: 'contact',
			},
			...contactDescription,
			...rowDescription,
			...tableDescription,
			...contractDescription,
			...contractTemplateDescription,
			...appointmentDescription,
			...appointmentTypeDescription,
			...formDescription,
			...formResponseDescription,
			...productDescription,
			...paymentDescription,
			...memberDescription,
			...workspaceDescription,
		],
	};

	methods = { listSearch, loadOptions, resourceMapping };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const cache = new ExecutionCache(this);

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const result = await runOperation(this, cache, resource, operation, i);
				const executionData = this.helpers.constructExecutionMetaData(
					this.helpers.returnJsonArray(result as IDataObject | IDataObject[]),
					{ itemData: { item: i } },
				);
				returnData.push(...executionData);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Both constructors hand back the error the request helper already built, message included.
				if (error instanceof NodeApiError) throw new NodeApiError(this.getNode(), error as unknown as JsonObject);
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
