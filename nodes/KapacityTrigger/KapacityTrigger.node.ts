import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { kapacityApiRequest } from '../Kapacity/shared/transport';

/** The events Kapacity sends, in the order of the sales journey. */
const EVENTS = [
	{ name: 'Contact Created', value: 'contact.cree', description: 'A contact is added to Mon Pipe or Setting' },
	{ name: 'Contact Updated', value: 'contact.modifie', description: 'A field of a contact changes' },
	{ name: 'Row Created', value: 'ligne.creee', description: 'A row is added to one of your tables' },
	{ name: 'Row Updated', value: 'ligne.modifiee', description: 'A row of one of your tables changes' },
	{ name: 'Appointment Booked', value: 'rendez_vous.pris', description: 'Someone books an appointment' },
	{ name: 'Appointment Rescheduled', value: 'rendez_vous.reprogramme', description: 'An appointment moves to another time' },
	{ name: 'Appointment Canceled', value: 'rendez_vous.annule', description: 'An appointment is canceled' },
	{ name: 'Form Submitted', value: 'formulaire.soumis', description: 'Someone submits one of your forms' },
	{ name: 'Contract Sent', value: 'contrat.envoye', description: 'A contract is sent for signature' },
	{ name: 'Contract Signed', value: 'contrat.signe', description: 'A contract comes back signed' },
	{ name: 'Payment Received', value: 'paiement.recu', description: 'A payment is received' },
];

/** Kapacity signs with the "Standard Webhooks" convention; a message older than this is refused (replay). */
const TIMESTAMP_TOLERANCE_SEC = 300;

/**
 * A secret header, unique to each subscription, that Kapacity adds to every call. It comes on top of the signature:
 * a call without it is refused before anything else, and the subscription shows it in Kapacity (Integrations).
 */
const KEY_HEADER = 'X-Kapacity-Key';

type StaticData = { webhookId?: string; secret?: string; headerKey?: string };

const sameEvents = (a: string[], b: string[]) => a.length === b.length && a.every((e) => b.includes(e));

/** The subtitle under the node: the names of the events, not their codes. */
const EVENT_NAMES = Object.fromEntries(EVENTS.map((e) => [e.value, e.name]));
const SUBTITLE = `={{$parameter["events"].map(e => (${JSON.stringify(EVENT_NAMES)})[e] || e).join(", ")}}`;

/** Compares two secrets in constant time. */
function sameSecret(given: string, expected: string): boolean {
	const a = Buffer.from(given);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

export class KapacityTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Kapacity Trigger',
		name: 'kapacityTrigger',
		icon: { light: 'file:../../icons/kapacity.svg', dark: 'file:../../icons/kapacity.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: SUBTITLE,
		description: 'Starts the workflow when something happens in Kapacity',
		defaults: { name: 'Kapacity Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'kapacityApi', required: true }],
		webhooks: [{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' }],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: EVENTS,
				default: [],
				required: true,
				description: 'The events that start the workflow',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Ignore Changes Made by the API',
						name: 'ignoreApiWrites',
						type: 'boolean',
						default: true,
						description:
							'Whether to ignore what is written through the Kapacity API (by this workflow or another one). Keep it on when the workflow writes to Kapacity: otherwise it would start itself again, endlessly.',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				if (!data.webhookId) return false;
				const response = await kapacityApiRequest.call(this, 'GET', '/webhooks');
				const hooks = (response.webhooks as IDataObject[] | undefined) ?? [];
				const hook = hooks.find((h) => h.id === data.webhookId);
				const events = this.getNodeParameter('events') as string[];
				if (
					hook &&
					hook.url === this.getNodeWebhookUrl('default') &&
					sameEvents(hook.evenements as string[], events) &&
					// A subscription made by 0.1.0 has no key header: it is recreated with one.
					hook.entete_nom === KEY_HEADER &&
					!!data.headerKey
				) {
					return true;
				}
				// Gone, or no longer what the node asks for: it is recreated with the right settings.
				// Only a 404 (already deleted on the Kapacity side) is ignored: any other failure is raised, otherwise the
				// old subscription would stay registered next to the new one and every event would fire the workflow twice.
				if (hook) {
					await kapacityApiRequest
						.call(this, 'DELETE', `/webhooks/${data.webhookId}`)
						.catch((error: { httpCode?: string }) => {
							if (error.httpCode !== '404') throw error;
						});
				}
				delete data.webhookId;
				delete data.secret;
				delete data.headerKey;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const events = this.getNodeParameter('events') as string[];
				if (!events.length) throw new NodeOperationError(this.getNode(), 'Choose at least one event');
				const options = this.getNodeParameter('options', {}) as IDataObject;
				const workflowName = this.getWorkflow().name ?? '';
				const headerKey = randomBytes(32).toString('base64url');
				const body: IDataObject = {
					nom: `n8n · ${workflowName || 'workflow'}`.slice(0, 80),
					url: this.getNodeWebhookUrl('default'),
					evenements: events,
					ignorer_api: options.ignoreApiWrites !== false,
					entete: { nom: KEY_HEADER, valeur: headerKey },
					description: 'Created by the n8n Kapacity Trigger. Deactivating the workflow deletes it.',
				};
				let response: IDataObject;
				try {
					response = await kapacityApiRequest.call(this, 'POST', '/webhooks', {}, body);
				} catch (error) {
					const url = String(body.url ?? '');
					if (!url.startsWith('https://') || /localhost|127\.0\.0\.1/.test(url)) {
						throw new NodeOperationError(
							this.getNode(),
							'Kapacity only calls public https addresses, and this n8n webhook address is not one',
							{
								description: `Address: ${url}. Set the WEBHOOK_URL environment variable of n8n to its public https address (or use a tunnel), then try again.`,
							},
						);
					}
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}
				const data = this.getWorkflowStaticData('node') as StaticData;
				data.webhookId = String((response.webhook as IDataObject).id);
				data.secret = String(response.secret);
				data.headerKey = headerKey;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node') as StaticData;
				if (data.webhookId) {
					try {
						await kapacityApiRequest.call(this, 'DELETE', `/webhooks/${data.webhookId}`);
					} catch (error) {
						// Already deleted on the Kapacity side (in Integrations): nothing is left to remove.
						const status = (error as { httpCode?: string }).httpCode;
						if (status !== '404') return false;
					}
				}
				delete data.webhookId;
				delete data.secret;
				delete data.headerKey;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const data = this.getWorkflowStaticData('node') as StaticData;
		const request = this.getRequestObject();
		const body = this.getBodyData() as IDataObject;
		const refuse = (error: string): IWebhookResponseData => {
			this.getResponseObject().status(401).json({ error });
			return { noWebhookResponse: true };
		};

		// First the key header, then the signature: both must be right.
		if (data.headerKey) {
			const given = (this.getHeaderData() as IDataObject)[KEY_HEADER.toLowerCase()];
			if (typeof given !== 'string' || !sameSecret(given, data.headerKey)) return refuse('Invalid key');
		}

		if (data.secret) {
			const headers = this.getHeaderData() as IDataObject;
			const id = String(headers['webhook-id'] ?? '');
			const timestamp = String(headers['webhook-timestamp'] ?? '');
			const signatures = String(headers['webhook-signature'] ?? '');
			const rawBody = (request as { rawBody?: Buffer }).rawBody;
			const payload = rawBody ? rawBody.toString('utf8') : JSON.stringify(body);
			if (!verifySignature(data.secret, id, timestamp, payload, signatures)) return refuse('Invalid signature');
		}

		const headers = this.getHeaderData() as IDataObject;
		return {
			workflowData: [
				this.helpers.returnJsonArray({
					...body,
					event_id: headers['webhook-id'] ?? null,
				}),
			],
		};
	}
}

/** `v1,<base64 HMAC-SHA256 of "<id>.<timestamp>.<raw body>">`, the key being the secret without "whsec_". */
function verifySignature(secret: string, id: string, timestamp: string, payload: string, header: string): boolean {
	const sentAt = Number(timestamp);
	if (!id || !Number.isFinite(sentAt)) return false;
	if (Math.abs(Date.now() / 1000 - sentAt) > TIMESTAMP_TOLERANCE_SEC) return false;
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64url');
	const expected = Buffer.from(createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64'));
	return header.split(' ').some((part) => {
		const [version, signature] = part.split(',');
		if (version !== 'v1' || !signature) return false;
		const given = Buffer.from(signature);
		return given.length === expected.length && timingSafeEqual(given, expected);
	});
}
