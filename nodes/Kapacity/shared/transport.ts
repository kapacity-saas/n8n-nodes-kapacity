import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

type Context = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

/**
 * The Kapacity API answers every refusal with `{ error, code }`. The `code` is stable, the message is written in
 * French for the end user: we show an English message chosen by code, and keep the API detail as the description.
 */
const MESSAGES: Record<string, string> = {
	cle_absente: 'The API key is missing',
	cle_invalide: 'The API key is not valid',
	cle_expiree: 'The API key has expired: create a new one in Kapacity, page Integrations, API tab',
	cle_revoquee: 'The API key has been revoked: create a new one in Kapacity, page Integrations, API tab',
	espace_incorrect: 'This API key does not belong to the workspace set in the credentials',
	portee: 'This API key is read-only: create a "Read and write" key to change data',
	proprietaire: 'Only a key created by the workspace owner can do this',
	introuvable: 'The requested item does not exist in this workspace',
	validation: 'Kapacity refused a value',
	quota_mensuel: 'The monthly API quota of this workspace is reached',
	debit: 'Too many requests per second: slow down the workflow',
	debit_heure: 'Too many requests in the last hour',
	disjoncteur: 'Writes to this record are paused: it was changed too often in a few seconds (loop protection)',
	limite_plan: 'A limit of the workspace plan is reached',
	api_fermee: 'The API is not open on this workspace yet',
};

/** Base address of a workspace: `https://kapacity.app/api/v1/w/<workspace>`. */
async function baseOf(ctx: Context): Promise<string> {
	const credentials = await ctx.getCredentials('kapacityApi');
	const base = String(credentials.baseUrl || 'https://kapacity.app').replace(/\/+$/, '');
	return `${base}/api/v1/w/${String(credentials.workspaceId).trim()}`;
}

/** One call to the Kapacity API. Every request of the package goes through here. */
export async function kapacityApiRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	qs: IDataObject = {},
	body: IDataObject | undefined = undefined,
	headers: IDataObject = {},
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${await baseOf(this)}${path}`,
		qs,
		body,
		headers: { Accept: 'application/json', ...headers },
		json: true,
	};
	if (body === undefined) delete options.body;
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, 'kapacityApi', options)) as IDataObject;
	} catch (error) {
		const { code, detail } = readRefusal(error);
		// n8n hands the error over ALREADY wrapped in a NodeApiError, and wrapping a NodeApiError again gives back the
		// same object, messages untouched: the new error is built from its cause, the HTTP error itself.
		const cause = (error as { cause?: unknown }).cause;
		const source = error instanceof NodeApiError && cause instanceof Error ? cause : error;
		throw new NodeApiError(this.getNode(), source as JsonObject, {
			message: (code && MESSAGES[code]) || undefined,
			description: detail ? `Kapacity: ${detail}` : undefined,
			httpCode: (error as { httpCode?: string | null }).httpCode ?? undefined,
		});
	}
}

type Refusal = { code?: string; error?: string };

/** The `{ error, code }` body of a refusal, wherever the HTTP layer of n8n put it. */
function readRefusal(error: unknown): { code?: string; detail?: string } {
	const e = error as {
		context?: { data?: unknown };
		cause?: { response?: { data?: unknown } };
		response?: { body?: unknown; data?: unknown };
	};
	const candidates = [e.context?.data, e.cause?.response?.data, e.response?.body, e.response?.data];
	for (const candidate of candidates) {
		const parsed = typeof candidate === 'string' ? safeJson(candidate) : (candidate as Refusal | undefined);
		if (parsed && typeof parsed === 'object' && (parsed.code || parsed.error)) {
			return { code: parsed.code, detail: parsed.error };
		}
	}
	return {};
}

function safeJson(text: string): Refusal | undefined {
	try {
		return JSON.parse(text) as Refusal;
	} catch {
		return undefined;
	}
}

/**
 * Every "Get Many" of the API is paginated by CURSOR (`curseur` in, `curseur_suivant` out), never by page number.
 * Reads pages of 200 until `limit` is reached, or everything when `limit` is 0.
 */
export async function kapacityApiRequestAll(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	path: string,
	listKey: string,
	qs: IDataObject = {},
	limit = 0,
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | undefined;
	do {
		const pageSize = limit ? Math.min(200, limit - items.length) : 200;
		const response = await kapacityApiRequest.call(this, 'GET', path, {
			...qs,
			limite: pageSize,
			...(cursor ? { curseur: cursor } : {}),
		});
		const page = (response[listKey] as IDataObject[] | undefined) ?? [];
		items.push(...page);
		cursor = (response.curseur_suivant as string | null | undefined) ?? undefined;
	} while (cursor && (!limit || items.length < limit));
	return limit ? items.slice(0, limit) : items;
}
