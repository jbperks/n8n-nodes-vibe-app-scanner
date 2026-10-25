import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

export class VibeAppScannerApi implements ICredentialType {
  name = 'vibeAppScannerApi';
  displayName = 'Vibe App Scanner API';
  documentationUrl = 'https://github.com/jbperks/n8n-nodes-vibe-app-scanner#credentials';
  icon = 'file:../nodes/VibeAppScanner/vas.svg' as const;
  properties: INodeProperties[] = [
    {
      displayName: 'API Key', name: 'apiKey', type: 'string',
      typeOptions: { password: true }, default: '', required: true,
      description: 'Use a VAS REST API key with scan:read. Starting scans also requires scan:create and an eligible account.',
    },
  ];
  authenticate: IAuthenticateGeneric = {
    type: 'generic', properties: { headers: { Authorization: '=Bearer {{$credentials.apiKey}}' } },
  };
  // A deliberate credential test reads one bounded owner-only scan-list page. It never starts a scan.
  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://api.vibeappscanner.com', url: '/scans', method: 'GET', qs: { limit: 1, offset: 0 },
      disableFollowRedirect: true, timeout: 15000,
    },
  };
}
