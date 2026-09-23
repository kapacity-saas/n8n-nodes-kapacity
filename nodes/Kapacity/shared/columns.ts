import type {
	FieldType,
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	ResourceMapperField,
} from 'n8n-workflow';
import { kapacityApiRequest } from './transport';

/** A column as `GET /tables/{id}` returns it. */
export interface KapacityColumn {
	id: string;
	nom: string;
	type: string;
	lecture_seule: boolean;
	options?: Array<{ id: string; libelle: string }>;
}

export interface KapacityMember {
	id: string;
	nom: string;
	email: string | null;
}

/** The two contact bases of Kapacity, which the API exposes as tables with these fixed IDs. */
export const CONTACT_BASES = ['leads', 'leads_setting'];

/**
 * Column types that can be written. Formulas, rollups, lookups, links, attachments and buttons are computed or
 * managed in Kapacity itself: the API refuses them, so they are never offered.
 */
const WRITABLE_TYPES = new Set([
	'texte',
	'texte_long',
	'nombre',
	'monetaire',
	'pourcentage',
	'selection',
	'selection_multiple',
	'case',
	'date',
	'datetime',
	'email',
	'telephone',
	'url',
	'membre',
	'note',
	'tags',
]);

/** Values written as a comma-separated text in n8n, and sent as a list. */
const LIST_TYPES = new Set(['selection_multiple', 'tags']);

export async function getColumns(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	tableId: string,
): Promise<KapacityColumn[]> {
	const response = await kapacityApiRequest.call(this, 'GET', `/tables/${encodeURIComponent(tableId)}`);
	return (response.colonnes as KapacityColumn[] | undefined) ?? [];
}

export async function getMembers(this: IExecuteFunctions | ILoadOptionsFunctions): Promise<KapacityMember[]> {
	const response = await kapacityApiRequest.call(this, 'GET', '/members');
	return (response.membres as KapacityMember[] | undefined) ?? [];
}

/**
 * Whether a column can be written. On a contact base, the e-mail is announced read-only (it is the contact's
 * identity, never edited on screen) but the API accepts it when creating: we offer it.
 */
export function isWritable(column: KapacityColumn, tableId: string): boolean {
	if (!WRITABLE_TYPES.has(column.type)) return false;
	if (CONTACT_BASES.includes(tableId) && column.id === 'email') return true;
	return !column.lecture_seule;
}

function fieldTypeOf(column: KapacityColumn): FieldType {
	switch (column.type) {
		case 'nombre':
		case 'monetaire':
		case 'pourcentage':
			return 'number';
		case 'case':
			return 'boolean';
		case 'date':
		case 'datetime':
			return 'dateTime';
		case 'selection':
		case 'membre':
			return 'options';
		default:
			return 'string';
	}
}

/** The label shown in n8n: amounts are typed in euros, lists as comma-separated text. */
export function fieldLabel(column: KapacityColumn): string {
	if (column.type === 'monetaire') return `${column.nom} (€)`;
	if (LIST_TYPES.has(column.type)) return `${column.nom} (comma-separated)`;
	return column.nom;
}

/** The columns of a table, as fields of n8n's column mapper. */
export function toMapperFields(
	columns: KapacityColumn[],
	tableId: string,
	members: KapacityMember[],
	required: string[] = [],
): ResourceMapperField[] {
	return columns
		.filter((column) => isWritable(column, tableId))
		.map((column) => {
			const field: ResourceMapperField = {
				id: column.id,
				displayName: fieldLabel(column),
				required: required.includes(column.id),
				defaultMatch: false,
				canBeUsedToMatch: false,
				display: true,
				type: fieldTypeOf(column),
			};
			if (column.type === 'selection') {
				field.options = (column.options ?? []).map((o) => ({ name: o.libelle, value: o.id }));
			}
			if (column.type === 'membre') {
				field.options = members.map((m) => ({ name: m.email ? `${m.nom} (${m.email})` : m.nom, value: m.id }));
			}
			return field;
		});
}

/**
 * The values typed in n8n, as the API expects them. Amounts go from euros to cents, lists from text to arrays.
 * An empty field is left out: it never erases a value by accident.
 */
export function toApiValues(values: IDataObject, columns: KapacityColumn[]): IDataObject {
	const byId = new Map(columns.map((c) => [c.id, c]));
	const out: IDataObject = {};
	for (const [key, raw] of Object.entries(values)) {
		if (raw === undefined || raw === null || raw === '') continue;
		const column = byId.get(key);
		if (!column) {
			out[key] = raw;
			continue;
		}
		if (column.type === 'monetaire') {
			const amount = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
			out[key] = Number.isFinite(amount) ? Math.round(amount * 100) : raw;
		} else if (LIST_TYPES.has(column.type)) {
			out[key] = Array.isArray(raw)
				? raw
				: String(raw)
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean);
		} else {
			out[key] = raw;
		}
	}
	return out;
}

/**
 * A record in a readable form: column names instead of IDs, option labels instead of option IDs, member names,
 * and amounts in euros. What most workflows want to use in the next node.
 */
export function toReadable(
	record: IDataObject,
	columns: KapacityColumn[],
	members: KapacityMember[],
): IDataObject {
	const values = (record.champs as IDataObject | undefined) ?? {};
	const byId = new Map(columns.map((c) => [c.id, c]));
	const memberName = new Map(members.map((m) => [m.id, m.nom]));
	const out: IDataObject = {
		id: record.id,
		created_at: record.cree_le,
		updated_at: record.modifie_le,
	};
	for (const [key, value] of Object.entries(values)) {
		const column = byId.get(key);
		if (!column) {
			out[key] = value;
			continue;
		}
		const label = (id: unknown) => column.options?.find((o) => o.id === id)?.libelle ?? id;
		let readable: unknown = value;
		if (value !== null && value !== undefined) {
			if (column.type === 'monetaire' && typeof value === 'number') readable = value / 100;
			else if (column.type === 'selection') readable = label(value);
			else if (column.type === 'selection_multiple' && Array.isArray(value)) readable = value.map(label);
			else if (column.type === 'membre') readable = memberName.get(String(value)) ?? value;
		}
		out[column.nom] = readable as IDataObject[keyof IDataObject];
	}
	return out;
}
