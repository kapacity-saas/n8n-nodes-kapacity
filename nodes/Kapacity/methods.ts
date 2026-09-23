import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
	INodePropertyOptions,
	ResourceMapperFields,
} from 'n8n-workflow';
import { CONTACT_BASES, getColumns, getMembers, isWritable, toMapperFields } from './shared/columns';
import { kapacityApiRequest } from './shared/transport';

const locatorValue = (ctx: ILoadOptionsFunctions, name: string): string =>
	String(ctx.getCurrentNodeParameter(name, { extractValue: true }) ?? '');

const matches = (filter: string | undefined, ...texts: Array<unknown>) => {
	if (!filter) return true;
	const f = filter.toLowerCase();
	return texts.some((t) => typeof t === 'string' && t.toLowerCase().includes(f));
};

/** A contact, as a line of a list: « First Last · e-mail ». */
function contactItem(row: IDataObject, baseName?: string): INodeListSearchItems {
	const fields = (row.champs as IDataObject | undefined) ?? {};
	const name = [fields.first_name, fields.last_name].filter(Boolean).join(' ') || '(no name)';
	const email = fields.email ? ` · ${String(fields.email)}` : '';
	return { name: `${name}${email}${baseName ? ` (${baseName})` : ''}`, value: String(row.id) };
}

async function searchIn(ctx: ILoadOptionsFunctions, base: string, filter?: string): Promise<IDataObject[]> {
	const qs: IDataObject = { limite: 50 };
	if (filter) qs.recherche = filter;
	const response = await kapacityApiRequest.call(ctx, 'GET', `/tables/${base}/records`, qs);
	return (response.lignes as IDataObject[] | undefined) ?? [];
}

export const listSearch = {
	/** Contacts of the base chosen above. */
	async searchContacts(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const base = String(this.getCurrentNodeParameter('base') ?? 'leads');
		return { results: (await searchIn(this, base, filter)).map((row) => contactItem(row)) };
	},

	/** Contacts of both bases, for a contract signer. */
	async searchAllContacts(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const [pipe, setting] = await Promise.all([searchIn(this, 'leads', filter), searchIn(this, 'leads_setting', filter)]);
		return {
			results: [
				...pipe.map((row) => contactItem(row, 'Mon Pipe')),
				...setting.map((row) => contactItem(row, 'Setting')),
			],
		};
	},

	/** Tables created in the CRM. The two contact bases have their own resource. */
	async searchTables(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const response = await kapacityApiRequest.call(this, 'GET', '/tables');
		const tables = ((response.tables as IDataObject[] | undefined) ?? []).filter(
			(t) => !CONTACT_BASES.includes(String(t.id)) && matches(filter, t.nom, t.base_libelle),
		);
		return {
			results: tables.map((t) => ({ name: `${String(t.nom)} (${String(t.base_libelle ?? '')})`, value: String(t.id) })),
		};
	},

	async searchContractTemplates(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const response = await kapacityApiRequest.call(this, 'GET', '/contract-templates');
		const templates = ((response.modeles as IDataObject[] | undefined) ?? []).filter((t) => matches(filter, t.titre));
		return {
			results: templates.map((t) => ({
				name: t.utilisable ? String(t.titre) : `${String(t.titre)} (not available: ${String(t.raison ?? '')})`,
				value: String(t.id),
			})),
		};
	},

	async searchContracts(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const response = await kapacityApiRequest.call(this, 'GET', '/contracts', { limite: 100 });
		const contracts = ((response.contrats as IDataObject[] | undefined) ?? []).filter((c) =>
			matches(filter, c.titre, (c.contact as IDataObject | null)?.nom),
		);
		return {
			results: contracts.map((c) => ({ name: `${String(c.titre)} · ${String(c.statut)}`, value: String(c.id) })),
		};
	},

	async searchForms(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
		const response = await kapacityApiRequest.call(this, 'GET', '/forms');
		const forms = ((response.formulaires as IDataObject[] | undefined) ?? []).filter((f) => matches(filter, f.titre));
		return { results: forms.map((f) => ({ name: String(f.titre), value: String(f.id) })) };
	},
};

export const loadOptions = {
	/** The commercial statuses of the chosen contact base. */
	async getContactStatuses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const base = String(this.getCurrentNodeParameter('base') ?? 'leads');
		const status = (await getColumns.call(this, base)).find((c) => c.id === 'status_id');
		return (status?.options ?? []).map((o) => ({ name: o.libelle, value: o.id }));
	},

	/** The columns of the chosen table, for a filter condition. */
	async getTableColumns(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
		const table = locatorValue(this, 'table');
		if (!table) return [];
		return (await getColumns.call(this, table)).map((c) => ({ name: c.nom, value: c.id }));
	},
};

export const resourceMapping = {
	async getContactFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
		const base = String(this.getCurrentNodeParameter('base') ?? 'leads');
		const operation = String(this.getCurrentNodeParameter('operation') ?? '');
		const [columns, members] = await Promise.all([getColumns.call(this, base), getMembers.call(this)]);
		// For "Create or Update", the e-mail has its own parameter above: it is not offered twice.
		const usable = operation === 'upsert' ? columns.filter((c) => c.id !== 'email') : columns;
		return { fields: toMapperFields(usable, base, members) };
	},

	async getRowFields(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
		const table = locatorValue(this, 'table');
		if (!table) return { fields: [] };
		const [columns, members] = await Promise.all([getColumns.call(this, table), getMembers.call(this)]);
		return { fields: toMapperFields(columns.filter((c) => isWritable(c, table)), table, members) };
	},
};
