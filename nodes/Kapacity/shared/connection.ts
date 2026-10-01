import type { NodeConnectionType } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

/**
 * The "main" connection of the nodes.
 *
 * n8n strips the peer dependencies of a community package, so the node loads the n8n-workflow it finds in
 * ~/.n8n/nodes. An instance upgraded from n8n 1.x can still keep an old copy there (before 1.90), which has no
 * NodeConnectionTypes: reading `.Main` on it throws, and n8n refuses the package ("Class could not be found").
 * NodeConnectionTypes.Main is used whenever it exists; its value, "main", only when it does not.
 */
export const MAIN_CONNECTION: NodeConnectionType =
	(NodeConnectionTypes as typeof NodeConnectionTypes | undefined)?.Main ?? ('main' as NodeConnectionType);
