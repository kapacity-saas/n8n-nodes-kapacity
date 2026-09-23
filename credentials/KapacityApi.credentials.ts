import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class KapacityApi implements ICredentialType {
	name = 'kapacityApi';

	displayName = 'Kapacity API';

	icon: Icon = { light: 'file:../icons/kapacity.svg', dark: 'file:../icons/kapacity.dark.svg' };

	documentationUrl = 'https://github.com/kapacity-saas/n8n-nodes-kapacity?tab=readme-ov-file#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'e.g. kap_live_…',
			description:
				'Create a key in Kapacity, page Integrations, API tab. Choose "Read and write" if the workflow creates or updates data.',
		},
		{
			displayName: 'Workspace ID',
			name: 'workspaceId',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'e.g. 1c100b3a-4cf0-44f7-a39a-531d95b9b86d',
			description: 'Shown in Kapacity, page Integrations, API tab, under "Workspace ID"',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://kapacity.app',
			description: 'Only change this if Kapacity gave you another address',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}/api/v1/w/{{$credentials.workspaceId}}',
			url: '/me',
			method: 'GET',
		},
	};
}
