import type { IExecuteFunctions, INode, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { httpError, MAX_ITEMS, prepareRequest, projectResponse, ScanContractError, validateOperation } from './ScanContract';
import type { ScanRequest } from './ScanContract';

function nodeFailure(node: INode, message: string, itemIndex?: number): NodeOperationError {
  // Error objects need location metadata, not raw parameters or credential references.
  const safeNode: INode = { id: node.id, name: node.name, type: node.type, typeVersion: node.typeVersion,
    position: node.position, parameters: {} };
  return new NodeOperationError(safeNode, message, itemIndex === undefined ? {} : { itemIndex });
}

export class VibeAppScanner implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Vibe App Scanner', name: 'vibeAppScanner', icon: { light: 'file:vas.svg', dark: 'file:vas.svg' }, group: ['transform'], version: 1,
    subtitle: '={{$parameter["operation"]}}', description: 'Start authorized deployment scans and read coverage-safe results',
    defaults: { name: 'Vibe App Scanner' },
    inputs: [NodeConnectionTypes.Main], outputs: [NodeConnectionTypes.Main],
    usableAsTool: undefined, // Deliberately not advertised as an AI-agent tool.
    credentials: [{ name: 'vibeAppScannerApi', required: true }],
    properties: [
      {
        displayName: 'Operation', name: 'operation', type: 'options', noDataExpression: true,
        options: [
          { name: 'Get Scan Status', value: 'getScanStatus', action: 'Get scan status', description: 'Read one scan without starting or restarting it' },
          { name: 'Get Scan Summary', value: 'getScanSummary', action: 'Get a coverage safe scan summary', description: 'Read counts and coverage without finding details or raw errors' },
          { name: 'Start Deployment Scan', value: 'startDeploymentScan', action: 'Start an authorized deployment scan', description: 'Admit or reuse a website quick scan for one stable deployment event' },
        ], default: 'getScanStatus',
      },
      {
        displayName: 'Scan ID', name: 'scanId', type: 'string', default: '', required: true,
        displayOptions: { show: { operation: ['getScanStatus', 'getScanSummary'] } },
        placeholder: '00000000-0000-4000-8000-000000000001', description: 'The scan UUID returned by VAS',
      },
      {
        displayName: 'Starting a scan uses your existing VAS allowance. Keep the same deployment ID on retries. No fallback or automatic replacement scan is used.',
        name: 'releaseNotice', type: 'notice', default: '', displayOptions: { show: { operation: ['startDeploymentScan'] } },
      },
      {
        displayName: 'App Origin', name: 'targetUrl', type: 'string', default: '', required: true, noDataExpression: true,
        displayOptions: { show: { operation: ['startDeploymentScan'] } }, placeholder: 'https://app.example.com',
        description: 'Fixed HTTPS origin you are authorized to scan. Paths, credentials, query strings and expressions are not accepted.',
      },
      {
        displayName: 'Event Namespace', name: 'eventNamespace', type: 'string', default: '', required: true, noDataExpression: true,
        displayOptions: { show: { operation: ['startDeploymentScan'] } }, placeholder: 'provider-production-app',
        description: 'Fixed provider and project identity, 1–32 letters, digits, dots, underscores or hyphens. Keep unchanged on retries.',
      },
      {
        displayName: 'Deployment ID', name: 'deploymentId', type: 'string', default: '', required: true,
        displayOptions: { show: { operation: ['startDeploymentScan'] } }, placeholder: 'deploy-0001',
        description: 'Stable provider deployment ID, up to 80 characters. Use the same ID on redelivery and retries, not a timestamp or n8n execution ID.',
      },
      {
        displayName: 'I Own or Am Authorized to Scan This App', name: 'ownershipConfirmed', type: 'boolean', default: false, noDataExpression: true,
        displayOptions: { show: { operation: ['startDeploymentScan'] } },
        description: 'Whether you confirm permission to run security checks on this fixed app origin',
      },
      {
        displayName: 'I Accept the VAS Scanning Terms', name: 'termsAccepted', type: 'boolean', default: false, noDataExpression: true,
        displayOptions: { show: { operation: ['startDeploymentScan'] } },
        description: 'Whether you accept the VAS scanning terms, version 1.0, at https://vibeappscanner.com/terms',
      },
      {
        displayName: 'One request per item, up to 20 items. Use n8n Wait and IF nodes for bounded status polling. Completion or zero findings does not establish that an app is secure.',
        name: 'coverageNotice', type: 'notice', default: '',
      },
    ],
  };

  // Programmatic to prevalidate the entire input batch before side effects and to
  // replace transport errors without retaining raw provider causes/headers/bodies.
  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    if (items.length > MAX_ITEMS) throw nodeFailure(this.getNode(), 'Send at most 20 items per execution. Use n8n batching for larger inputs.');
    if (!items.length) return [[]];
    const plans: ScanRequest[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        const raw = this.getNode().parameters;
        const operation = validateOperation(raw.operation ?? 'getScanStatus');
        const values = operation === 'startDeploymentScan' ? {
          targetUrl: raw.targetUrl, eventNamespace: raw.eventNamespace,
          ownershipConfirmed: raw.ownershipConfirmed, termsAccepted: raw.termsAccepted,
          deploymentId: this.getNodeParameter('deploymentId', itemIndex, ''),
        } : { scanId: this.getNodeParameter('scanId', itemIndex, '') };
        plans.push(prepareRequest(operation, values));
      } catch (error) {
        const message = error instanceof ScanContractError ? error.message : 'Check this operation and its required inputs. No requests were sent.';
        throw nodeFailure(this.getNode(), message, itemIndex);
      }
    }
    const results: INodeExecutionData[] = [];
    for (const [itemIndex, request] of plans.entries()) {
      try {
        let response: unknown;
        try {
          response = await this.helpers.httpRequestWithAuthentication.call(this, 'vibeAppScannerApi', request.options);
        } catch {
          // Never attach the original transport exception as a cause.
          throw httpError(undefined, request.operation);
        }
        results.push({ json: projectResponse(response, request), pairedItem: { item: itemIndex } });
      } catch (error) {
        const message = error instanceof ScanContractError ? error.message : 'VAS returned an unreadable result. Inspect the existing scan; do not start a replacement.';
        const safeError = nodeFailure(this.getNode(), message, itemIndex);
        if (!this.continueOnFail()) throw safeError;
        results.push({ json: { error: message }, pairedItem: { item: itemIndex } });
      }
    }
    return [results];
  }
}
