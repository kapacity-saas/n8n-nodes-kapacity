import type { IDataObject, IExecuteFunctions, ResourceMapperValue } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	getColumns,
	getMembers,
	toApiValues,
	toReadable,
	type KapacityColumn,
	type KapacityMember,
} from './shared/columns';
import { kapacityApiRequest, kapacityApiRequestAll } from './shared/transport';

/**
 * What one execution reads once and reuses for every item: the columns of each table and the members. Without it,
 * 500 items would mean 1 000 extra calls, and the API quota is counted per call.
 */
export class ExecutionCache {
	private columns = new Map<string, Promise<KapacityColumn[]>>();

	private members: Promise<KapacityMember[]> | undefined;

	constructor(private readonly ctx: IExecuteFunctions) {}

	columnsOf(table: string): Promise<KapacityColumn[]> {
		if (!this.columns.has(table)) this.columns.set(table, getColumns.call(this.ctx, table));
		return this.columns.get(table) as Promise<KapacityColumn[]>;
	}

	allMembers(): Promise<KapacityMember[]> {
		if (!this.members) this.members = getMembers.call(this.ctx);
		return this.members;
	}
}

type Result = IDataObject | IDataObject[];

const param = <T>(ctx: IExecuteFunctions, name: string, i: number, fallback?: T): T =>
	ctx.getNodeParameter(name, i, fallback) as T;

const locator = (ctx: IExecuteFunctions, name: string, i: number): string =>
	String(ctx.getNodeParameter(name, i, '', { extractValue: true }) ?? '').trim();

/** The query that turns the automations off, when the user asked for it. */
const automationsQs = (options: IDataObject): IDataObject =>
	options.triggerAutomations === false ? { automatisations: 'false' } : {};

/** A path with repeated `filtre` parameters: the API reads one condition per parameter. */
function withFilters(path: string, filters: string[]): string {
	if (!filters.length) return path;
	return `${path}?${filters.map((f) => `filtre=${encodeURIComponent(f)}`).join('&')}`;
}

async function present(
	ctx: IExecuteFunctions,
	cache: ExecutionCache,
	table: string,
	record: IDataObject,
	options: IDataObject,
): Promise<IDataObject> {
	if (options.outputFormat === 'raw') return record;
	const [columns, members] = await Promise.all([cache.columnsOf(table), cache.allMembers()]);
	return toReadable(record, columns, members);
}

async function listOf(
	ctx: IExecuteFunctions,
	i: number,
	path: string,
	listKey: string,
	qs: IDataObject = {},
): Promise<IDataObject[]> {
	const returnAll = param<boolean>(ctx, 'returnAll', i, false);
	const limit = returnAll ? 0 : param<number>(ctx, 'limit', i, 50);
	return kapacityApiRequestAll.call(ctx, path, listKey, qs, limit);
}

/** The values of the column mapper, converted for the API. */
async function mappedValues(ctx: IExecuteFunctions, cache: ExecutionCache, table: string, i: number): Promise<IDataObject> {
	const mapper = param<ResourceMapperValue>(ctx, 'fields', i, { value: {} } as ResourceMapperValue);
	return toApiValues((mapper.value ?? {}) as IDataObject, await cache.columnsOf(table));
}

// ---- Records (contacts and rows share the same endpoints) ---------------------------------------------------

async function createRecord(ctx: IExecuteFunctions, cache: ExecutionCache, table: string, i: number, extra: IDataObject = {}) {
	const options = param<IDataObject>(ctx, 'options', i, {});
	const champs = { ...(await mappedValues(ctx, cache, table, i)), ...extra };
	const response = await kapacityApiRequest.call(ctx, 'POST', `/tables/${table}/records`, automationsQs(options), { champs });
	return present(ctx, cache, table, response.ligne as IDataObject, options);
}

async function updateRecord(ctx: IExecuteFunctions, cache: ExecutionCache, table: string, id: string, i: number) {
	const options = param<IDataObject>(ctx, 'options', i, {});
	const champs = await mappedValues(ctx, cache, table, i);
	if (!Object.keys(champs).length) {
		throw new NodeOperationError(ctx.getNode(), 'No field to update: fill in at least one field', { itemIndex: i });
	}
	const response = await kapacityApiRequest.call(ctx, 'PATCH', `/records/${id}`, automationsQs(options), { champs });
	return present(ctx, cache, table, response.ligne as IDataObject, options);
}

async function getRecord(ctx: IExecuteFunctions, cache: ExecutionCache, table: string, id: string, i: number) {
	const options = param<IDataObject>(ctx, 'options', i, {});
	const response = await kapacityApiRequest.call(ctx, 'GET', `/records/${id}`);
	return present(ctx, cache, table, response.ligne as IDataObject, options);
}

async function deleteRecord(ctx: IExecuteFunctions, id: string) {
	await kapacityApiRequest.call(ctx, 'DELETE', `/records/${id}`);
	return { deleted: true, id };
}

async function listRecords(ctx: IExecuteFunctions, cache: ExecutionCache, table: string, i: number, filtersIn: string[], qs: IDataObject) {
	const options = param<IDataObject>(ctx, 'options', i, {});
	const rows = await listOf(ctx, i, withFilters(`/tables/${table}/records`, filtersIn), 'lignes', qs);
	return Promise.all(rows.map((row) => present(ctx, cache, table, row, options)));
}

// ---- Contact --------------------------------------------------------------------------------------------------

async function contact(ctx: IExecuteFunctions, cache: ExecutionCache, operation: string, i: number): Promise<Result> {
	const base = param<string>(ctx, 'base', i, 'leads');
	switch (operation) {
		case 'create':
			return createRecord(ctx, cache, base, i);
		case 'upsert': {
			const email = param<string>(ctx, 'email', i, '').trim();
			if (!email) throw new NodeOperationError(ctx.getNode(), 'The e-mail is required to find the contact', { itemIndex: i });
			const found = await kapacityApiRequest.call(ctx, 'GET', withFilters(`/tables/${base}/records`, [`email:eq:${email}`]), {
				limite: 1,
			});
			const existing = ((found.lignes as IDataObject[] | undefined) ?? [])[0];
			if (existing) {
				const updated = await updateRecordOrKeep(ctx, cache, base, String(existing.id), i, existing);
				return { ...updated, upsert: 'updated' };
			}
			return { ...(await createRecord(ctx, cache, base, i, { email })), upsert: 'created' };
		}
		case 'get':
			return getRecord(ctx, cache, base, locator(ctx, 'contactId', i), i);
		case 'update':
			return updateRecord(ctx, cache, base, locator(ctx, 'contactId', i), i);
		case 'delete':
			return deleteRecord(ctx, locator(ctx, 'contactId', i));
		case 'getAll': {
			const filters = param<IDataObject>(ctx, 'filters', i, {});
			const conditions: string[] = [];
			if (filters.email) conditions.push(`email:eq:${String(filters.email).trim()}`);
			if (filters.status) conditions.push(`status_id:eq:${String(filters.status)}`);
			const qs: IDataObject = {};
			if (filters.search) qs.recherche = filters.search;
			if (filters.updatedSince) qs.modifie_depuis = filters.updatedSince;
			return listRecords(ctx, cache, base, i, conditions, qs);
		}
	}
	throw new NodeOperationError(ctx.getNode(), `Unknown contact operation "${operation}"`, { itemIndex: i });
}

/** "Create or Update" on a contact that exists: nothing to change is not an error, the contact comes back as is. */
async function updateRecordOrKeep(
	ctx: IExecuteFunctions,
	cache: ExecutionCache,
	table: string,
	id: string,
	i: number,
	existing: IDataObject,
) {
	const champs = await mappedValues(ctx, cache, table, i);
	if (!Object.keys(champs).length) return present(ctx, cache, table, existing, param<IDataObject>(ctx, 'options', i, {}));
	return updateRecord(ctx, cache, table, id, i);
}

// ---- Row ------------------------------------------------------------------------------------------------------

async function row(ctx: IExecuteFunctions, cache: ExecutionCache, operation: string, i: number): Promise<Result> {
	const table = locator(ctx, 'table', i);
	if (!table) throw new NodeOperationError(ctx.getNode(), 'Choose a table', { itemIndex: i });
	switch (operation) {
		case 'create':
			return createRecord(ctx, cache, table, i);
		case 'get':
			return getRecord(ctx, cache, table, param<string>(ctx, 'rowId', i).trim(), i);
		case 'update':
			return updateRecord(ctx, cache, table, param<string>(ctx, 'rowId', i).trim(), i);
		case 'delete':
			return deleteRecord(ctx, param<string>(ctx, 'rowId', i).trim());
		case 'getAll': {
			const filters = param<IDataObject>(ctx, 'filters', i, {});
			const columns = await cache.columnsOf(table);
			const conditions = ((filters.conditions as IDataObject | undefined)?.condition as IDataObject[] | undefined) ?? [];
			const filtersIn = conditions
				.filter((c) => c.column)
				.map((c) => `${String(c.column)}:${String(c.operator ?? 'eq')}:${filterValue(columns, c)}`.replace(/:$/, ''));
			const qs: IDataObject = {};
			if (filters.search) qs.recherche = filters.search;
			if (filters.updatedSince) qs.modifie_depuis = filters.updatedSince;
			return listRecords(ctx, cache, table, i, filtersIn, qs);
		}
	}
	throw new NodeOperationError(ctx.getNode(), `Unknown row operation "${operation}"`, { itemIndex: i });
}

/**
 * The value of a filter condition, as the API compares it: a choice column compares option IDs (the user types the
 * label), an amount compares cents (the user types euros).
 */
function filterValue(columns: KapacityColumn[], condition: IDataObject): string {
	if (condition.operator === 'vide' || condition.operator === 'non_vide') return '';
	const raw = String(condition.value ?? '');
	const column = columns.find((c) => c.id === condition.column);
	if (column?.type === 'selection' || column?.type === 'selection_multiple') {
		const option = column.options?.find((o) => o.libelle.toLowerCase() === raw.trim().toLowerCase());
		return option ? option.id : raw;
	}
	if (column?.type === 'monetaire') {
		const amount = Number(raw.replace(',', '.'));
		return Number.isFinite(amount) ? String(Math.round(amount * 100)) : raw;
	}
	return raw;
}

// ---- Contract -------------------------------------------------------------------------------------------------

async function contract(ctx: IExecuteFunctions, operation: string, i: number): Promise<Result> {
	switch (operation) {
		case 'send': {
			const more = param<IDataObject>(ctx, 'additionalFields', i, {});
			const amount = param<number>(ctx, 'amount', i, 0);
			const body: IDataObject = {
				modele_id: locator(ctx, 'templateId', i),
				contact_id: locator(ctx, 'signerId', i),
				montant_cents: Math.round(Number(amount) * 100),
			};
			if (more.title) body.titre = more.title;
			if (more.sendEmail === false) body.envoyer_email = false;
			if (more.emailTemplateId) body.message_email_id = String(more.emailTemplateId).trim();
			const headers: IDataObject = more.idempotencyKey ? { 'Idempotency-Key': String(more.idempotencyKey) } : {};
			const response = await kapacityApiRequest.call(ctx, 'POST', '/contracts', automationsQs(more), body, headers);
			const email = (response.email as IDataObject | undefined) ?? {};
			return {
				...(response.contrat as IDataObject),
				email_sent: email.envoye === true,
				email_to: email.a ?? null,
				email_not_sent_reason: email.raison ?? null,
			};
		}
		case 'get': {
			const response = await kapacityApiRequest.call(ctx, 'GET', `/contracts/${locator(ctx, 'contractId', i)}`);
			return { ...(response.contrat as IDataObject), audit_trail: response.piste_audit as IDataObject[] };
		}
		case 'getAll': {
			const filters = param<IDataObject>(ctx, 'filters', i, {});
			const qs: IDataObject = {};
			if (filters.since) qs.depuis = filters.since;
			if (filters.status) qs.statut = filters.status;
			if (filters.contact) qs.contact = String(filters.contact).trim();
			return listOf(ctx, i, '/contracts', 'contrats', qs);
		}
	}
	throw new NodeOperationError(ctx.getNode(), `Unknown contract operation "${operation}"`, { itemIndex: i });
}

// ---- Everything that is only read ------------------------------------------------------------------------------

async function simpleList(ctx: IExecuteFunctions, path: string, key: string): Promise<IDataObject[]> {
	const response = await kapacityApiRequest.call(ctx, 'GET', path);
	return (response[key] as IDataObject[] | undefined) ?? [];
}

function datesAndStatus(filters: IDataObject): IDataObject {
	const qs: IDataObject = {};
	if (filters.since) qs.depuis = filters.since;
	if (filters.until) qs.jusqu_a = filters.until;
	if (filters.status) qs.statut = filters.status;
	if (filters.contact) qs.contact = String(filters.contact).trim();
	return qs;
}

export async function runOperation(
	ctx: IExecuteFunctions,
	cache: ExecutionCache,
	resource: string,
	operation: string,
	i: number,
): Promise<Result> {
	switch (resource) {
		case 'contact':
			return contact(ctx, cache, operation, i);
		case 'row':
			return row(ctx, cache, operation, i);
		case 'contract':
			return contract(ctx, operation, i);
		case 'table':
			if (operation === 'getColumns') {
				return (await cache.columnsOf(locator(ctx, 'table', i))) as unknown as IDataObject[];
			}
			return simpleList(ctx, '/tables', 'tables');
		case 'contractTemplate':
			return simpleList(ctx, '/contract-templates', 'modeles');
		case 'appointment':
			return listOf(ctx, i, '/bookings', 'rendez_vous', datesAndStatus(param<IDataObject>(ctx, 'filters', i, {})));
		case 'appointmentType':
			return simpleList(ctx, '/event-types', 'types_de_rendez_vous');
		case 'form':
			return simpleList(ctx, '/forms', 'formulaires');
		case 'formResponse': {
			const filters = param<IDataObject>(ctx, 'filters', i, {});
			const qs: IDataObject = {};
			if (filters.since) qs.depuis = filters.since;
			if (filters.qualified !== undefined) qs.qualifie = filters.qualified ? 'true' : 'false';
			return listOf(ctx, i, `/forms/${locator(ctx, 'formId', i)}/responses`, 'reponses', qs);
		}
		case 'product':
			return simpleList(ctx, '/products', 'produits');
		case 'payment':
			return listOf(ctx, i, '/payments', 'paiements', datesAndStatus(param<IDataObject>(ctx, 'filters', i, {})));
		case 'member':
			return simpleList(ctx, '/members', 'membres');
		case 'workspace':
			return kapacityApiRequest.call(ctx, 'GET', '/me');
	}
	throw new NodeOperationError(ctx.getNode(), `Unknown resource "${resource}"`, { itemIndex: i });
}
